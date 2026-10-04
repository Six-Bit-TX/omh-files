import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const webRequire = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = webRequire("playwright");
const react = await readFile(webRequire.resolve("react/package.json").replace("package.json", "umd/react.production.min.js"), "utf8");
const reactDom = await readFile(webRequire.resolve("react-dom/package.json").replace("package.json", "umd/react-dom.production.min.js"), "utf8");
const bundle = await readFile(new URL("../client.js", import.meta.url), "utf8");

test("saving retains newer edits and ignores completions from a previously opened file", async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", route => {
    if (new URL(route.request().url()).pathname === "/") return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"engine offline"}' });
  });
  await page.goto("https://harness.test/");
  await page.addScriptTag({ content: react });
  await page.addScriptTag({ content: reactDom });
  await page.evaluate(() => {
    window.__ModuleLoader__ = { load: definition => { window.plugin = definition.factory(() => window.React); } };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    window.writes = [];
    const root = window.ReactDOM.createRoot(document.getElementById("root"));
    const signal = new AbortController().signal;
    const ctx = {
      effect: fn => fn(),
      locale: { bind: () => key => key, register: () => () => {}, getLocale: () => ({ active: "en" }) },
      sidebarRightTabs: { register: () => () => {} },
      sidebarRight: { registerCloseHandler: () => () => {} },
      remote: { workspaceFiles: {
        readAll: async (_session, path) => ({ ok: true, value: { data: btoa("original " + path), version: path + "-v1" } }),
        write: (session, path, text, version) => new Promise((resolve, reject) => window.writes.push({ session, path, text, version, resolve, reject }))
      } },
      slots: { inject: (_name, fn) => fn(), register: (_seat, Component) => {
        window.openFile = path => root.render(window.React.createElement(Component, {
          t: key => key,
          useTabInfo: () => ({ tab: { contentId: "dsh-resource://file/session/test/" + path, signal } })
        }));
        window.openFile("first.md");
        return () => {};
      } }
    };
    window.plugin.apply(ctx);
  });
  const source = page.locator("[data-markdown-source]");
  const save = page.locator("[data-markdown-save]");
  await source.fill("submitted edit");
  await save.click();
  await page.waitForFunction(() => window.writes.length === 1);
  await source.fill("newer edit typed during save");
  await page.evaluate(() => window.writes[0].resolve({ ok: true, value: { version: "first.md-v2" } }));
  await page.waitForFunction(() => !document.querySelector("[data-markdown-save]").disabled);
  assert.equal(await source.inputValue(), "newer edit typed during save");
  assert.equal(await save.getAttribute("data-markdown-save"), "dirty");
  await save.click();
  assert.deepEqual(await page.evaluate(() => ({ text: window.writes[1].text, version: window.writes[1].version })), {
    text: "newer edit typed during save", version: "first.md-v2"
  });

  await page.evaluate(() => window.openFile("second.md"));
  await page.waitForFunction(() => document.querySelector("[data-markdown-source]")?.value === "original second.md");
  await source.fill("second file draft");
  await page.evaluate(() => window.writes[1].resolve({ ok: true, value: { version: "first.md-v3" } }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await source.inputValue(), "second file draft");
  assert.equal(await save.getAttribute("data-markdown-save"), "dirty");
  await save.click();
  assert.deepEqual(await page.evaluate(() => ({ path: window.writes[2].path, text: window.writes[2].text, version: window.writes[2].version })), {
    path: "second.md", text: "second file draft", version: "second.md-v1"
  });
  await page.evaluate(() => window.writes[2].resolve({ ok: true, value: { version: "second.md-v2" } }));
  await page.waitForFunction(() => document.querySelector("[data-markdown-save]").dataset.markdownSave === "clean");
  assert.equal(await source.inputValue(), "second file draft");
});

test("reload restores a Markdown draft and refuses to overwrite an external edit until resolved", async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.on("dialog", dialog => dialog.accept());
  await page.route("**/*", route => new URL(route.request().url()).pathname === "/"
    ? route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' })
    : route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"engine offline"}' }));
  await page.goto("https://harness.test/");
  const mount = async disk => {
    await page.addScriptTag({ content: react });
    await page.addScriptTag({ content: reactDom });
    await page.evaluate(() => {
      window.__ModuleLoader__ = { load: definition => { window.plugin = definition.factory(() => window.React); } };
    });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(disk => {
      window.disk = disk;
      window.writes = [];
      const root = window.ReactDOM.createRoot(document.getElementById("root"));
      const signal = new AbortController().signal;
      const tab = { id: "t2", contentId: "dsh-resource://file/session/test/notes.md", signal };
      window.plugin.apply({
        effect: fn => fn(),
        locale: { bind: () => key => key, register: () => () => {}, getLocale: () => ({ active: "en" }) },
        sidebarRightTabs: { register: () => () => {} },
        sidebarRight: { registerCloseHandler: (_kind, handler) => { window.closeTab = () => handler("test", tab); return () => {}; } },
        remote: { workspaceFiles: {
          readAll: async () => ({ ok: true, value: { data: btoa(window.disk.text), version: window.disk.version } }),
          write: async (_session, _path, text, version) => {
            window.writes.push({ text, version });
            if (version !== window.disk.version) return { ok: false, error: { code: "workspace-file/stale" } };
            window.disk = { text, version: "v3" };
            return { ok: true, value: { version: "v3" } };
          }
        } },
        slots: { inject: (_name, fn) => fn(), register: (_seat, Component) => {
          root.render(window.React.createElement(Component, { t: key => key, useTabInfo: () => ({ tab }) }));
          return () => {};
        } }
      });
    }, disk);
  };
  await mount({ text: "original", version: "v1" });
  const source = page.locator("[data-markdown-source]");
  await source.fill("my draft");
  assert.equal(await page.evaluate(() => {
    window.confirm = () => false;
    return window.closeTab();
  }), false);
  await page.reload();
  await mount({ text: "external edit", version: "v2" });
  await page.waitForFunction(() => document.querySelector("[data-markdown-source]")?.value === "my draft");
  assert.equal(await page.locator("[data-markdown-conflict] pre").textContent(), "external edit");
  await source.press("Control+s");
  assert.equal(await page.evaluate(() => window.writes.length), 0);
  await source.fill("external edit and my draft");
  await page.locator("[data-markdown-resolve]").click();
  await page.locator("[data-markdown-save]").click();
  await page.waitForFunction(() => document.querySelector("[data-markdown-save]").dataset.markdownSave === "clean");
  assert.deepEqual(await page.evaluate(() => window.writes), [{ text: "external edit and my draft", version: "v2" }]);
  assert.equal(await page.evaluate(() => localStorage.getItem("dsh.markdown.draft.v1.test.notes.md")), null);
  assert.equal(await page.evaluate(() => window.closeTab()), true);
});
