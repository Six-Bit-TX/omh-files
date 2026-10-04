/** Local Office editing in session-scoped file tabs. */
window.__ModuleLoader__.load({
  id: "@local/dsh-client-ui-office",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;
    const ID = "@local/dsh-client-ui-office";
    const NS = "sidebarOffice";
    const SCRIPT_URL = "/office/web-apps/apps/api/documents/api.js";
    const FILE_PREFIX = "dsh-resource://file/session/";
    const POLL_MS = 3000;
    let scriptLoad;
    let editorSequence = 0;

    const zh = {
      local: "本地文件",
      opening: "正在打开文档…",
      loading: "正在加载编辑器…",
      ready: "编辑后，使用上方“保存到本地”按钮，并等待保存确认。",
      dirty: "有改动尚未确认写回本地文件。请使用上方“保存到本地”按钮。",
      saving: "正在等待本地保存确认，请保持标签页打开…",
      save: "保存到本地",
      saveBusy: "正在保存…",
      sendPending: "正在同步编辑内容，完成后即可保存到本地。",
      unchanged: "编辑器尚未提供新的文件版本。请稍后再次保存到本地。",
      saved: "已保存到本地文件",
      savedAt: "已保存到本地文件 · {time}",
      lastSaved: "上次确认写入本地 · {time}",
      saveError: "本地保存失败",
      conflict: "本地文件已被其他程序修改，保存被阻止。请保留编辑器中的改动。",
      statusError: "无法确认本地保存状态，请保持标签页打开。",
      editorError: "编辑器发生错误",
      retry: "重新打开",
      checkStatus: "检查保存状态",
      pendingRetry: "请先保存并等待本地确认，再重新打开。",
      invalidFile: "只能打开当前会话中的 DOCX、XLSX 或 PPTX 文件。",
      requestFailed: "请求失败（HTTP {status}）",
      invalidResponse: "本地 Office 服务返回了无效响应。",
      editorUnavailable: "无法加载本地 Office 编辑器，请检查文档服务是否正在运行。",
      invalidScript: "本地 Office 编辑器地址无效。",
      networkError: "无法连接本地 Office 服务。",
    };
    const en = {
      local: "Local file",
      opening: "Opening document…",
      loading: "Loading editor…",
      ready: "After editing, use Save locally above and wait for confirmation.",
      dirty: "Changes are not yet confirmed in the local file. Use Save locally above.",
      saving: "Waiting for local save confirmation. Keep this tab open…",
      save: "Save locally",
      saveBusy: "Saving…",
      sendPending: "Sending edits to the editor service. Save locally when this finishes.",
      unchanged: "The editor has not produced a new file version yet. Try Save locally again shortly.",
      saved: "Saved to local file",
      savedAt: "Saved to local file · {time}",
      lastSaved: "Last confirmed local write · {time}",
      saveError: "Local save failed",
      conflict: "Another program changed the local file. Saving was blocked; keep your edits in the editor.",
      statusError: "Local save status could not be confirmed. Keep this tab open.",
      editorError: "Editor error",
      retry: "Reopen",
      checkStatus: "Check save status",
      pendingRetry: "Save and wait for local confirmation before reopening.",
      invalidFile: "Open a DOCX, XLSX, or PPTX file from the current session.",
      requestFailed: "Request failed (HTTP {status})",
      invalidResponse: "The local Office service returned an invalid response.",
      editorUnavailable: "The local Office editor could not load. Check that the document service is running.",
      invalidScript: "The local Office editor address is invalid.",
      networkError: "Could not connect to the local Office service.",
    };

    const CSS = `
.OMHO_pane{box-sizing:border-box;display:flex;flex:1;flex-direction:column;height:100%;min-height:0;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
.OMHO_header{box-sizing:border-box;display:flex;flex:none;align-items:center;gap:10px;min-height:38px;padding:5px 12px;border-bottom:.5px solid var(--dsw-alias-border-l3)}
.OMHO_name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:20px;font-weight:500}
.OMHO_local{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.OMHO_body{position:relative;display:flex;flex:1;min-height:0;overflow:hidden}
.OMHO_editor{flex:1;min-width:0;min-height:0;height:100%}
.OMHO_editor>div,.OMHO_editor>iframe{display:block;width:100%;height:100%;border:0}
.OMHO_loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:var(--dsw-alias-bg-base);text-align:center;font-size:13px;line-height:21px}
.OMHO_message{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.OMHO_note{display:flex;flex:none;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:8px 12px;border-top:.5px solid var(--dsw-alias-border-l3);font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}
.OMHO_note[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
.OMHO_copy{flex:1;min-width:0;overflow-wrap:anywhere}
.OMHO_last{display:block;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.OMHO_button{flex:none;min-height:28px;padding:3px 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.OMHO_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.OMHO_button:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.OMHO_button:disabled{opacity:.5;cursor:default}
`;

    /** Decode only the session-scoped Office resources this renderer owns. */
    function sessionFileOf(address) {
      if (typeof address !== "string" || !address.startsWith(FILE_PREFIX)) return undefined;
      const end = address.search(/[?#]/u);
      const parts = address.slice(FILE_PREFIX.length, end < 0 ? undefined : end).split("/");
      const session = parts.shift();
      if (!session || parts.length === 0) return undefined;
      try {
        const path = parts.map(decodeURIComponent).join("/");
        return /\.(docx|xlsx|pptx)$/iu.test(path)
          ? { sessionId: decodeURIComponent(session), path }
          : undefined;
      } catch (error) {
        // Malformed resource escapes cannot identify a session file.
        return undefined;
      }
    }

    /** Keep service failures separate from locale-owned fallback messages. */
    function failure(key, values = {}) {
      return Object.assign(new Error(key), { officeKey: key, officeValues: values });
    }

    /** Read authenticated same-origin JSON without exposing editor configuration. */
    async function request(path, init) {
      let response;
      try {
        response = await fetch(path, { credentials: "same-origin", ...init });
      } catch (error) {
        if (init.signal.aborted) throw error;
        throw failure("networkError");
      }
      let body;
      try {
        body = await response.json();
      } catch (error) {
        if (init.signal.aborted) throw error;
        throw failure(response.ok ? "invalidResponse" : "requestFailed", { status: response.status });
      }
      if (!response.ok) {
        const detail = typeof body?.detail === "string" ? body.detail : typeof body?.error === "string" ? body.error : undefined;
        throw detail === undefined ? failure("requestFailed", { status: response.status }) : new Error(detail);
      }
      return body;
    }

    /** One shared script request; a failed request may be retried explicitly. */
    function loadEditor(scriptUrl) {
      if (scriptUrl !== SCRIPT_URL) return Promise.reject(failure("invalidScript"));
      if (typeof window.DocsAPI?.DocEditor === "function") return Promise.resolve(window.DocsAPI);
      if (scriptLoad !== undefined) return scriptLoad;
      scriptLoad = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;
        script.dataset.officeEditor = "true";
        script.onload = () => {
          if (typeof window.DocsAPI?.DocEditor === "function") resolve(window.DocsAPI);
          else { script.remove(); reject(failure("editorUnavailable")); }
        };
        script.onerror = () => { script.remove(); reject(failure("editorUnavailable")); };
        document.head.appendChild(script);
      }).catch(error => { scriptLoad = undefined; throw error; });
      return scriptLoad;
    }

    /** Render local fallback copy, retaining the host's concrete error detail. */
    function errorText(error, t) {
      return error?.officeKey ? t(error.officeKey, error.officeValues) : error?.message || t("invalidResponse");
    }

    /** Parse the host's save timestamp for display without changing its identity. */
    function saveTime(value, language) {
      if (value === undefined) return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    /** The editor owns its DOM subtree; React owns its surrounding file chrome. */
    function OfficePane({ useTabInfo, t, openOffice, officeStatus, saveOffice, language }) {
      const { tab } = useTabInfo();
      const file = sessionFileOf(tab.contentId);
      const fileKey = file ? file.sessionId + "\u0000" + file.path : "";
      const host = React.useRef(null);
      const pending = React.useRef(false);
      const check = React.useRef(null);
      const save = React.useRef(null);
      const [editorId] = React.useState(() => "omh-office-editor-" + ++editorSequence);
      const [attempt, setAttempt] = React.useState(0);
      const [view, setView] = React.useState({ phase: "opening", language: "en", dirty: false, editorDirty: false, saving: false, saveError: undefined, savedAt: undefined, hostState: "ready", error: undefined, editorError: undefined });

      React.useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        const container = host.current;
        const lang = language();
        let live = true;
        let editor;
        let timer;
        let pollInFlight = false;
        let generation = 0;
        let editorDirty = false;
        let requestedSave;
        pending.current = false;
        setView({ phase: "opening", language: lang, dirty: false, editorDirty: false, saving: false, saveError: undefined, savedAt: undefined, hostState: "ready", error: undefined, editorError: undefined });
        const update = patch => { if (live && !signal.aborted) setView(value => ({ ...value, ...patch })); };
        const unload = event => {
          if (!pending.current) return;
          event.preventDefault();
          event.returnValue = "";
        };
        window.addEventListener("beforeunload", unload);
        const dispose = () => {
          if (!live) return;
          live = false;
          controller.abort();
          clearTimeout(timer);
          check.current = null;
          save.current = null;
          window.removeEventListener("beforeunload", unload);
          tab.signal.removeEventListener("abort", dispose);
          if (editor !== undefined) editor.destroyEditor();
          container?.replaceChildren();
        };
        tab.signal.addEventListener("abort", dispose, { once: true });
        if (tab.signal.aborted) { dispose(); return dispose; }

        const startPolling = id => {
          const poll = async () => {
            if (!live || signal.aborted || pollInFlight) return;
            clearTimeout(timer);
            pollInFlight = true;
            const saveAtStart = requestedSave;
            try {
              const status = await officeStatus(id, signal);
              if (!live || signal.aborted) return;
              // Native saves prove a snapshot reached disk, but cannot identify
              // the edits it includes. Only our matching force-save nonce may
              // confirm the generation captured by the Save locally button.
              if (status.state === "saved" && requestedSave && status.savedRevision === requestedSave.revision) {
                if (generation === requestedSave.generation && !editorDirty) pending.current = false;
                requestedSave = undefined;
              } else if (status.state === "conflict" || (status.state === "error" && requestedSave === saveAtStart)) requestedSave = undefined;
              update({
                dirty: pending.current,
                saving: requestedSave !== undefined,
                hostState: status.state,
                error: typeof status.error === "string" ? new Error(status.error) : undefined,
                ...(status.state === "saved" ? { savedAt: status.savedAt } : {}),
              });
            } catch (error) {
              if (live && !signal.aborted) update({ hostState: "unconfirmed", error });
            } finally {
              pollInFlight = false;
              if (live && !signal.aborted) timer = setTimeout(poll, POLL_MS);
            }
          };
          check.current = poll;
          save.current = async () => {
            if (!live || signal.aborted || !pending.current || editorDirty || requestedSave) return;
            const request = { revision: crypto.randomUUID() + "_" + generation, generation };
            requestedSave = request;
            update({ saving: true, saveError: undefined });
            try {
              const result = await saveOffice(id, request.revision, signal);
              if (!live || signal.aborted || requestedSave !== request) return;
              if (!result.accepted) {
                requestedSave = undefined;
                update({ saving: false, saveError: failure("unchanged") });
              } else void poll();
            } catch (error) {
              if (!live || signal.aborted || requestedSave !== request) return;
              requestedSave = undefined;
              update({ saving: false, saveError: error });
            }
          };
          void poll();
        };

        if (file === undefined) {
          update({ phase: "failed", error: failure("invalidFile") });
          return dispose;
        }
        void (async () => {
          try {
            const opened = await openOffice(file, lang, signal);
            if (!live || signal.aborted) return;
            update({ phase: "loading" });
            const api = await loadEditor(opened.scriptUrl);
            if (!live || signal.aborted) return;
            const mount = document.createElement("div");
            mount.id = editorId;
            container.replaceChildren(mount);
            editor = new api.DocEditor(editorId, {
              ...opened.config,
              events: {
                ...opened.config.events,
                onAppReady: () => update({ phase: "loading" }),
                onDocumentReady: () => update({ phase: "ready" }),
                onError: event => {
                  const detail = event?.data?.errorDescription;
                  update({ editorError: typeof detail === "string" ? new Error(detail) : failure("editorError") });
                },
                onDocumentStateChange: event => {
                  if (!live || signal.aborted) return;
                  editorDirty = event?.data === true;
                  if (editorDirty) { generation++; pending.current = true; }
                  update({ dirty: pending.current, editorDirty, saveError: undefined });
                },
              },
            });
            startPolling(opened.id);
          } catch (error) {
            update({ phase: "failed", error });
          }
        })();
        return dispose;
      }, [fileKey, attempt, editorId, tab.signal, openOffice, officeStatus, saveOffice, language]);

      const savedTime = saveTime(view.savedAt, view.language);
      const hostProblem = ["error", "conflict", "unconfirmed"].includes(view.hostState) || view.saveError !== undefined;
      let status = view.dirty ? t(view.editorDirty ? "sendPending" : view.saving ? "saving" : "dirty") : view.savedAt !== undefined ? savedTime ? t("savedAt", { time: savedTime }) : t("saved") : t("ready");
      if (view.hostState === "conflict") status = t("conflict");
      else if (view.hostState === "error") status = t("saveError");
      else if (view.hostState === "unconfirmed") status = t("statusError");
      else if (view.saveError) status = errorText(view.saveError, t);
      const reopen = () => { if (!pending.current) setAttempt(value => value + 1); };
      const name = file?.path.split(/[/\\]/u).pop() || tab.title;
      return h("section", { className: "OMHO_pane", "data-office-state": view.phase, "data-office-dirty": view.dirty ? "true" : "false" },
        h("header", { className: "OMHO_header" },
          h("span", { className: "OMHO_name", title: file?.path }, name),
          h("span", { className: "OMHO_local" }, t("local")),
          h("button", { type: "button", className: "OMHO_button", disabled: !view.dirty || view.editorDirty || view.saving || view.phase !== "ready" || view.hostState === "conflict", onClick: () => { void save.current?.(); } }, t(view.saving ? "saveBusy" : "save"))),
        view.editorError ? h("div", { className: "OMHO_note", "data-tone": "error", role: "alert" },
          h("span", { className: "OMHO_copy" }, t("editorError") + ": " + errorText(view.editorError, t)),
          h("button", { type: "button", className: "OMHO_button", onClick: reopen, disabled: view.dirty, title: view.dirty ? t("pendingRetry") : undefined }, t("retry"))) : null,
        h("div", { className: "OMHO_body" },
          h("div", { className: "OMHO_editor", ref: host, "data-office-editor": true }),
          view.phase !== "ready" ? h("div", { className: "OMHO_loading", role: view.phase === "failed" ? "alert" : "status" },
            h("p", { className: "OMHO_message" }, view.phase === "failed" ? errorText(view.error, t) : t(view.phase === "opening" ? "opening" : "loading")),
            view.phase === "failed" && file !== undefined ? h("button", { type: "button", className: "OMHO_button", onClick: reopen, disabled: view.dirty }, t("retry")) : null) : null),
        h("footer", { className: "OMHO_note", "data-tone": hostProblem ? "error" : undefined, "data-office-save-state": view.hostState, role: hostProblem ? "alert" : "status", "aria-live": "polite" },
          h("span", { className: "OMHO_copy" }, status,
            hostProblem && view.error ? h("span", { className: "OMHO_last" }, errorText(view.error, t)) : null,
            (view.dirty || hostProblem) && savedTime ? h("span", { className: "OMHO_last" }, t("lastSaved", { time: savedTime })) : null),
          hostProblem ? h("button", { type: "button", className: "OMHO_button", onClick: () => { void check.current?.(); } }, t("checkStatus")) : null));
    }

    /** Register reversible presentation effects; components receive callbacks only. */
    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement("style");
        style.dataset.pluginCss = ID;
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      }, "office: styles");
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "office: dictionaries");
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: ID,
        kind: "office",
        patterns: ["*.docx", "*.xlsx", "*.pptx"],
        canOpen: address => sessionFileOf(address) !== undefined,
        title: address => sessionFileOf(address)?.path.split(/[/\\]/u).pop() || address,
      }), "office: tab type");
      const face = {
        language: () => ctx.locale.getLocale().active.toLowerCase().startsWith("zh") ? "zh" : "en",
        openOffice: async (file, lang, signal) => {
          const opened = await request("/api/office.open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...file, lang }), signal });
          if (typeof opened?.id !== "string" || typeof opened?.config !== "object" || opened.config === null || typeof opened?.scriptUrl !== "string") throw failure("invalidResponse");
          return opened;
        },
        officeStatus: async (id, signal) => {
          const status = await request("/api/office.status?id=" + encodeURIComponent(id), { signal });
          if (!["ready", "saved", "conflict", "error"].includes(status?.state)) throw failure("invalidResponse");
          return status;
        },
        saveOffice: async (id, revision, signal) => {
          const result = await request("/api/office.save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, revision }), signal });
          if (result?.accepted !== true && !(result?.accepted === false && result?.unchanged === true)) throw failure("invalidResponse");
          return result;
        },
      };
      ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: ID, locale: NS, inject: () => face }, OfficePane)), "office: body");
    }

    return { apply, inject: ["slots", "locale", "sidebarRightTabs"] };
  },
});
