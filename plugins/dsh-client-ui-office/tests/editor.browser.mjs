/** Exercise the actual client bundle in Chromium with an isolated editor service. */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const webRequire = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = webRequire("playwright");
const react = await readFile(webRequire.resolve("react/package.json").replace("package.json", "umd/react.production.min.js"), "utf8");
const reactDom = await readFile(webRequire.resolve("react-dom/package.json").replace("package.json", "umd/react-dom.production.min.js"), "utf8");
const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

const editorScript = `
window.editors = window.editors || [];
window.DocsAPI = { DocEditor: function(id, config) {
  const target = document.getElementById(id);
  if (!target) throw new Error('Editor target missing');
  const surface = document.createElement('div');
  surface.dataset.fakeOfficeEditor = id;
  target.replaceWith(surface);
  const entry = { id, config, destroyed: false };
  window.editors.push(entry);
  this.destroyEditor = () => { entry.destroyed = true; surface.remove(); };
  queueMicrotask(() => { config.events.onAppReady(); config.events.onDocumentReady(); });
}};`;

/** Mount the plugin through its real effect, locale, tab, and slot declarations. */
async function setup(t, options = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  let scriptRequests = 0;
  let failScript = options.failScript ?? false;
  await page.route("**/*", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: '<div id="root" style="height:800px"></div>' });
    if (path === "/office/web-apps/apps/api/documents/api.js") {
      scriptRequests++;
      return route.fulfill({ status: failScript ? 503 : 200, contentType: "text/javascript", body: failScript ? "" : editorScript });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("https://harness.test/");
  await page.addScriptTag({ content: react });
  await page.addScriptTag({ content: reactDom });
  await page.evaluate(options => {
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => nativeTimeout(fn, ms === 3000 ? 30 : ms, ...args);
    window.requests = [];
    window.pendingRequests = [];
    window.aborts = 0;
    window.hostStatus = { state: "ready" };
    window.holdOpen = options.holdOpen ?? false;
    window.holdStatus = false;
    window.openFailure = options.openFailure ?? false;
    window.saveResult = { accepted: true };
    window.scriptUrl = options.scriptUrl ?? "/office/web-apps/apps/api/documents/api.js";
    window.fetch = (url, init) => new Promise((resolve, reject) => {
      const isOpen = url === "/api/office.open";
      const isSave = url === "/api/office.save";
      const entry = { url, body: init.body ? JSON.parse(init.body) : undefined, signal: init.signal };
      window.requests.push(entry);
      const reply = body => resolve(new Response(JSON.stringify(body), { status: isOpen && window.openFailure ? 503 : 200, headers: { "content-type": "application/json" } }));
      init.signal.addEventListener("abort", () => { window.aborts++; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
      const body = isOpen ? window.openFailure ? { error: "office-unavailable", detail: "Document service is offline" } : {
        id: "document-1",
        scriptUrl: window.scriptUrl,
        config: { document: { key: "test-key", fileType: "docx" }, editorConfig: { customization: { forcesave: false } }, token: "signed-test-config" },
      } : isSave ? { ...window.saveResult } : { ...window.hostStatus };
      if (isOpen ? window.holdOpen : !isSave && window.holdStatus) window.pendingRequests.push({ ...entry, reply, body });
      else reply(body);
    });
    window.__ModuleLoader__ = { load: definition => {
      window.moduleId = definition.id;
      window.plugin = definition.factory(name => {
        if (name === "react") return window.React;
        throw new Error("Unexpected import " + name);
      });
    } };
  }, options);
  await page.addScriptTag({ content: source });
  await page.evaluate(options => {
    const root = window.ReactDOM.createRoot(document.getElementById("root"));
    const signals = new Map();
    const disposers = [];
    let dictionaries;
    let seat;
    let Pane;
    const lang = options.lang ?? "en";
    const t = (key, values = {}) => {
      let value = dictionaries[lang][key];
      if (value === undefined) throw new Error("Missing locale key " + key);
      for (const [key, replacement] of Object.entries(values)) value = value.replaceAll("{" + key + "}", String(replacement));
      return value;
    };
    const ctx = {
      effect: fn => { const dispose = fn(); if (typeof dispose === "function") disposers.push(dispose); return dispose; },
      locale: { register: (_ns, value) => { dictionaries = value; return () => {}; }, getLocale: () => ({ active: lang }) },
      sidebarRightTabs: { register: definition => { window.tabDefinition = definition; return () => {}; } },
      slots: { inject: (_name, fn) => fn(), register: (definition, component) => { seat = definition; Pane = component; return () => {}; } },
    };
    window.plugin.apply(ctx);
    window.mountFiles = addresses => root.render(window.React.createElement(window.React.Fragment, null, ...addresses.map(address => {
      if (!signals.has(address)) signals.set(address, new AbortController());
      return window.React.createElement(Pane, { key: address, ...seat.inject(), t, useTabInfo: () => ({ tab: { title: "file", contentId: address, signal: signals.get(address).signal } }) });
    })));
    window.unmountOffice = () => root.unmount();
    window.disposeOffice = () => { root.unmount(); for (const dispose of disposers.reverse()) dispose(); };
    window.abortTab = address => signals.get(address)?.abort();
    window.openFile = path => window.mountFiles(["dsh-resource://file/session/session-1/" + path]);
    window.openFile(options.path ?? "report.docx");
  }, options);
  return { page, scriptRequests: () => scriptRequests, scriptFailure: value => { failScript = value; } };
}

async function ready(page, count = 1) {
  await page.waitForFunction(count => document.querySelectorAll('[data-office-state="ready"]').length === count, count);
  await page.waitForFunction(() => window.requests.some(entry => entry.url.startsWith("/api/office.status")));
}

test("claims only session Office files and preserves the host-signed editor configuration", async t => {
  const { page, scriptRequests } = await setup(t, { path: "%E8%AE%A1%E5%88%92.xlsx", lang: "zh" });
  await ready(page);
  const result = await page.evaluate(() => ({
    id: window.moduleId,
    kind: window.tabDefinition.kind,
    patterns: window.tabDefinition.patterns,
    accepted: ["dsh-resource://file/session/s/a.DOCX", "dsh-resource://file/session/s/a.xlsx", "dsh-resource://file/session/s/a.pptx?line=3"].map(window.tabDefinition.canOpen),
    refused: ["file:///tmp/a.docx", "dsh-resource://file/host/a.docx", "dsh-resource://file/session/s/a.doc", "dsh-resource://file/session/s/%E0%A4%A.docx"].map(window.tabDefinition.canOpen),
    opened: window.requests.find(entry => entry.body).body,
    token: window.editors[0].config.token,
    forcesave: window.editors[0].config.editorConfig.customization.forcesave,
  }));
  assert.deepEqual(result, {
    id: "@local/dsh-client-ui-office", kind: "office", patterns: ["*.docx", "*.xlsx", "*.pptx"],
    accepted: [true, true, true], refused: [false, false, false, false],
    opened: { sessionId: "session-1", path: "计划.xlsx", lang: "zh" }, token: "signed-test-config", forcesave: false,
  });
  assert.equal(scriptRequests(), 1);
  assert.match(await page.locator("[data-office-save-state]").innerText(), /保存到本地/u);
});

test("shares the editor script while mounting and destroying independent pane instances", async t => {
  const { page, scriptRequests } = await setup(t);
  await ready(page);
  await page.evaluate(() => window.mountFiles(["dsh-resource://file/session/session-1/report.docx", "dsh-resource://file/session/session-1/slides.pptx"]));
  await ready(page, 2);
  assert.equal(scriptRequests(), 1);
  assert.equal(await page.evaluate(() => new Set(window.editors.map(editor => editor.id)).size), 2);
  await page.evaluate(() => window.disposeOffice());
  assert.equal(await page.evaluate(() => window.editors.every(editor => editor.destroyed)), true);
  assert.equal(await page.locator('style[data-plugin-css="@local/dsh-client-ui-office"]').count(), 0);
  const requests = await page.evaluate(() => window.requests.length);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.requests.length), requests);
});

test("only the requested local-save revision confirms edits, while native saves retain the warning", async t => {
  const { page } = await setup(t);
  await ready(page);
  await page.evaluate(() => {
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.editors[0].config.events.onDocumentStateChange({ data: false });
  });
  await page.waitForFunction(() => document.querySelector("[data-office-dirty]").dataset.officeDirty === "true");
  assert.match(await page.locator("[data-office-save-state]").innerText(), /Use Save locally above/u);
  assert.equal(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
  await page.evaluate(() => { window.hostStatus = { state: "saved", savedAt: "2026-09-22T12:30:00.000Z" }; });
  await page.waitForFunction(() => document.querySelector("[data-office-save-state]").textContent.includes("Last confirmed local write"));
  assert.equal(await page.locator("[data-office-dirty]").getAttribute("data-office-dirty"), "true");
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  const saveRequest = await page.evaluate(() => window.requests.find(entry => entry.url === "/api/office.save").body);
  assert.equal(saveRequest.id, "document-1");
  assert.match(saveRequest.revision, /^[A-Za-z0-9_-]{1,100}$/u);
  await page.evaluate(() => {
    const request = window.requests.find(entry => entry.url === "/api/office.save");
    window.hostStatus = { state: "saved", savedAt: "2026-09-22T12:31:00.000Z", savedRevision: request.body.revision };
  });
  await page.waitForFunction(() => document.querySelector("[data-office-dirty]").dataset.officeDirty === "false");
  assert.match(await page.locator("[data-office-save-state]").innerText(), /Saved to local file/u);
  assert.equal(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), false);
});

test("an old native save arriving after newer edits and a new poll never confirms those edits", async t => {
  const { page } = await setup(t);
  await ready(page);
  await page.evaluate(() => {
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.editors[0].config.events.onDocumentStateChange({ data: false });
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.editors[0].config.events.onDocumentStateChange({ data: false });
    window.holdStatus = true;
  });
  await page.waitForFunction(() => window.pendingRequests.length === 1);
  await page.evaluate(() => {
    window.hostStatus = { state: "saved", savedAt: "2026-09-22T12:30:00.000Z" };
    window.pendingRequests.shift().reply(window.hostStatus);
    window.holdStatus = false;
  });
  await page.waitForFunction(() => document.querySelector("[data-office-save-state]").textContent.includes("Last confirmed local write"));
  assert.equal(await page.locator("[data-office-dirty]").getAttribute("data-office-dirty"), "true");
  assert.equal(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
});

test("a matching save cannot confirm newer edits and a later explicit save can", async t => {
  const { page } = await setup(t);
  await ready(page);
  assert.equal(await page.getByRole("button", { name: "Save locally", exact: true }).isDisabled(), true);
  await page.evaluate(() => window.editors[0].config.events.onDocumentStateChange({ data: true }));
  assert.equal(await page.getByRole("button", { name: "Save locally", exact: true }).isDisabled(), true);
  await page.evaluate(() => window.editors[0].config.events.onDocumentStateChange({ data: false }));
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page.evaluate(() => {
    const first = window.requests.find(entry => entry.url === "/api/office.save");
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.editors[0].config.events.onDocumentStateChange({ data: false });
    window.hostStatus = { state: "saved", savedAt: "2026-09-22T12:30:00.000Z", savedRevision: first.body.revision };
  });
  await page.getByRole("button", { name: "Save locally", exact: true }).waitFor();
  assert.equal(await page.locator("[data-office-dirty]").getAttribute("data-office-dirty"), "true");
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page.evaluate(() => {
    const requests = window.requests.filter(entry => entry.url === "/api/office.save");
    if (requests.length !== 2 || requests[0].body.revision === requests[1].body.revision) throw new Error("Save requests must have distinct revisions");
    window.hostStatus = { state: "saved", savedAt: "2026-09-22T12:31:00.000Z", savedRevision: requests[1].body.revision };
  });
  await page.waitForFunction(() => document.querySelector("[data-office-dirty]").dataset.officeDirty === "false");
});

test("an unchanged force-save response stays pending and allows retry", async t => {
  const { page } = await setup(t);
  await ready(page);
  await page.evaluate(() => {
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.editors[0].config.events.onDocumentStateChange({ data: false });
    window.saveResult = { accepted: false, unchanged: true };
  });
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-office-save-state]").textContent.includes("not produced a new file version"));
  assert.equal(await page.locator("[data-office-dirty]").getAttribute("data-office-dirty"), "true");
  assert.equal(await page.getByRole("button", { name: "Save locally", exact: true }).isEnabled(), true);
});

test("a stale error poll cannot release a save requested after the poll began", async t => {
  const { page } = await setup(t);
  await ready(page);
  await page.evaluate(() => {
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.editors[0].config.events.onDocumentStateChange({ data: false });
    window.holdStatus = true;
  });
  await page.waitForFunction(() => window.pendingRequests.length === 1);
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page.evaluate(() => {
    window.pendingRequests.shift().reply({ state: "error", error: "Previous save failed" });
    window.holdStatus = false;
    const request = window.requests.find(entry => entry.url === "/api/office.save");
    window.hostStatus = { state: "saved", savedAt: "2026-09-22T12:30:00.000Z", savedRevision: request.body.revision };
  });
  await page.waitForFunction(() => document.querySelector("[data-office-dirty]").dataset.officeDirty === "false");
});

test("save conflicts retain the editor and pending changes, and retry only checks status", async t => {
  const { page } = await setup(t);
  await ready(page);
  await page.evaluate(() => {
    window.editors[0].config.events.onDocumentStateChange({ data: true });
    window.hostStatus = { state: "conflict", error: "The file changed on disk." };
  });
  await page.waitForFunction(() => document.querySelector("[data-office-save-state]").dataset.officeSaveState === "conflict");
  await page.getByRole("button", { name: "Check save status" }).click();
  assert.match(await page.locator("[data-office-save-state]").innerText(), /Another program changed/u);
  assert.equal(await page.locator("[data-office-dirty]").getAttribute("data-office-dirty"), "true");
  await page.evaluate(() => window.editors[0].config.events.onError({ data: { errorCode: 1, errorDescription: "Connection interrupted" } }));
  assert.equal(await page.getByRole("button", { name: "Reopen" }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.editors.length), 1);
  assert.equal(await page.evaluate(() => window.requests.filter(entry => entry.body).length), 1);
});

test("an unavailable script can be retried without retaining a rejected loader", async t => {
  const fixture = await setup(t, { failScript: true });
  await fixture.page.getByRole("button", { name: "Reopen" }).waitFor();
  assert.match(await fixture.page.locator('[data-office-state="failed"]').innerText(), /could not load/u);
  fixture.scriptFailure(false);
  await fixture.page.getByRole("button", { name: "Reopen" }).click();
  await ready(fixture.page);
  assert.equal(fixture.scriptRequests(), 2);
});

test("unmount aborts a pending open and never mounts its late result", async t => {
  const { page } = await setup(t, { holdOpen: true });
  await page.waitForFunction(() => window.pendingRequests.length === 1);
  await page.evaluate(() => window.unmountOffice());
  assert.equal(await page.evaluate(() => window.aborts), 1);
  await page.evaluate(() => { const request = window.pendingRequests.shift(); request.reply(request.body); });
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.editors?.length ?? 0), 0);
});

test("rejects an external editor script and allows retrying an unavailable local service", async t => {
  const { page, scriptRequests } = await setup(t, { openFailure: true });
  await page.getByRole("button", { name: "Reopen" }).waitFor();
  assert.match(await page.locator('[data-office-state="failed"]').innerText(), /Document service is offline/u);
  await page.evaluate(() => { window.openFailure = false; window.scriptUrl = "https://remote.example/editor.js"; });
  await page.getByRole("button", { name: "Reopen" }).click();
  await page.waitForFunction(() => document.querySelector('[data-office-state="failed"]')?.textContent.includes("address is invalid"));
  assert.equal(scriptRequests(), 0);
});
