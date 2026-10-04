/**
 * In-place Markdown editing in the right Sidebar — browser half.
 *
 * One tab type, `markdown`, claims `.md` / `.markdown` session files in the
 * `extension` band, which outranks the shipped document preview's `fallback`
 * text type. The pane reads the file through the product's own
 * `workspaceFiles` Remote (whole-file read, version-guarded write), mounts the
 * Muya engine on a container node, mirrors the editor's own serialization into
 * a draft, and saves only when the user asks.
 *
 * Four guards keep the editor from rewriting a file behind the user's back:
 *
 * 1. **A round-trip gate per file.** On open the pane serializes the file it
 *    just read and compares with the bytes on disk. The engine canonicalizes
 *    some constructs (table column padding, nested-list indentation, blank
 *    lines, fence info strings), so a drifting file opens in **source mode**
 *    with the reason stated, not in a mode that would rewrite it on save.
 * 2. **No change, no write.** A save with no recorded edit writes nothing.
 * 3. **Version-guarded writes.** Every save carries the version the file was
 *    read at, so a file that moved underneath the pane is refused, never
 *    overwritten.
 * 4. **Stated drift.** A save reports how far the serialization moved from the
 *    bytes that were read.
 *
 * The engine is not bundled here: the host half mirrors the installed
 * `@muyajs/core` package under `/api/muya/`, and this pane loads its ES entry
 * by URL so the engine's own relative imports and fonts resolve.
 *
 * @module @local/dsh-client-ui-markdown
 */

window.__ModuleLoader__.load({
	id: "@local/dsh-client-ui-markdown",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		//#region css
		const PANE_CSS = ".DSHMD_pane{box-sizing:border-box;flex-direction:column;flex:auto;height:100%;min-height:0;display:flex;font-family:var(--dsw-font-family)}.DSHMD_header{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l3);flex:none;align-items:center;gap:4px;height:38px;padding:0 6px 0 16px;display:flex}.DSHMD_path{white-space:nowrap;flex:auto;min-width:0;margin-right:12px;font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis}.DSHMD_name{color:var(--dsw-alias-label-primary)}.DSHMD_dirty{background:var(--dsw-alias-brand-primary,#4d6bfe);border-radius:50%;flex:none;width:6px;height:6px;margin-right:6px}.DSHMD_tool{height:28px;min-width:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:28px;flex:none;justify-content:center;align-items:center;gap:4px;padding:0 8px;font-size:12px;line-height:1;display:inline-flex}.DSHMD_tool:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.DSHMD_tool:disabled{opacity:.4;cursor:default}.DSHMD_body{min-height:0;flex:auto;display:flex;overflow:hidden;position:relative}.DSHMD_editor{flex:auto;min-height:0;overflow:auto}.DSHMD_source{box-sizing:border-box;border:none;outline:none;resize:none;width:100%;height:100%;padding:16px;font-family:var(--dsw-font-family-monospace,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);tab-size:2}.DSHMD_status{min-height:0;flex:auto;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:24px;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,13px);text-align:center;line-height:1.6;display:flex}.DSHMD_message{white-space:pre-wrap;margin:0}.DSHMD_note{border-bottom:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);flex:none;padding:6px 16px;font-size:12px;line-height:1.5}.DSHMD_note[data-tone=warn]{color:var(--dsw-alias-label-warning,#b7791f)}.DSHMD_note[data-tone=error]{color:var(--dsw-alias-label-danger,#c53030)}.DSHMD_retry{height:26px;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;background:0 0;border:.5px solid var(--dsw-alias-border-l3);border-radius:13px;margin-left:8px;padding:0 10px}.DSHMD_retry:hover{background:var(--dsw-alias-interactive-bg-hover)}";
		const PANE_CSS_TAG_ID = "@local/dsh-client-ui-markdown/MarkdownPane.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(PANE_CSS_TAG_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@local/dsh-client-ui-markdown";
			tag.dataset.pluginCss = PANE_CSS_TAG_ID;
			tag.textContent = PANE_CSS;
			document.head.appendChild(tag);
		}
		const css = {
			pane: "DSHMD_pane",
			header: "DSHMD_header",
			path: "DSHMD_path",
			name: "DSHMD_name",
			dirty: "DSHMD_dirty",
			tool: "DSHMD_tool",
			body: "DSHMD_body",
			editor: "DSHMD_editor",
			source: "DSHMD_source",
			status: "DSHMD_status",
			message: "DSHMD_message",
			note: "DSHMD_note",
			retry: "DSHMD_retry"
		};
		//#endregion
		//#region address
		/** The prefix every session-scoped file address opens with. */
		const SESSION_FILE_PREFIX = "dsh-resource://file/session/";
		/**
		 * Read a session file address back into the scope and path to hand the Remote.
		 * @param address - a tab's `dsh-resource://file/session/…` address.
		 * @returns the session and path, or undefined for any other address.
		 */
		function sessionFileOf(address) {
			if (typeof address !== "string" || !address.startsWith(SESSION_FILE_PREFIX)) return void 0;
			const end = address.search(/[?#]/u);
			const rest = address.slice(SESSION_FILE_PREFIX.length, end === -1 ? void 0 : end).split("/");
			const id = rest.shift();
			if (id === void 0 || id === "" || rest.length === 0) return void 0;
			try {
				return {
					sessionId: decodeURIComponent(id),
					path: rest.map(decodeURIComponent).join("/")
				};
			} catch {
				return void 0;
			}
		}
		/**
		 * Split a path for display: the directories through their last separator,
		 * and the final segment after it.
		 * @param path - POSIX or Windows path.
		 * @returns the directory prefix (possibly empty) and the final segment.
		 */
		function pathPartsOf(path) {
			const trimmed = String(path).replace(/[/\\]+$/u, "");
			if (trimmed === "") return {
				directory: "",
				name: String(path)
			};
			const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1;
			return {
				directory: trimmed.slice(0, cut),
				name: trimmed.slice(cut)
			};
		}
		/** Address globs this type claims: the Markdown suffixes the product recognises. */
		const MARKDOWN_PATTERNS = ["*.md", "*.markdown"];
		//#endregion
		//#region engine
		/** URL prefix the host half mirrors the engine package under. */
		const ASSET_PREFIX = "/api/muya";
		/** The engine's ES entry, which resolves its own chunks and fonts relatively. */
		const ENGINE_ENTRY = ASSET_PREFIX + "/es/index.js";
		/** The engine's stylesheet, whose font URLs resolve beside it. */
		const ENGINE_CSS = ASSET_PREFIX + "/core.css";
		/** The engine's own failure explanation, asked for only after a load fails. */
		const ENGINE_STATUS = ASSET_PREFIX + "/status";
		/** The load this page has already started, so one page shares one engine. */
		let engineLoad;
		/**
		 * Load the engine once per page.
		 *
		 * `process.env.NODE_ENV` is read unguarded inside the engine's logger, so
		 * a browser needs the global before the module is evaluated; the stylesheet
		 * is appended first so the editor's first paint is already styled.
		 * @returns the engine module namespace.
		 */
		function loadEngine() {
			if (engineLoad !== void 0) return engineLoad;
			engineLoad = (async () => {
				if (window.process === void 0) window.process = { env: { NODE_ENV: "production" } };
				if (document.querySelector("link[data-markdown-engine]") === null) {
					const link = document.createElement("link");
					link.rel = "stylesheet";
					link.href = ENGINE_CSS;
					link.dataset.markdownEngine = "core";
					document.head.appendChild(link);
				}
				return await import(ENGINE_ENTRY);
			})().catch((error) => {
				engineLoad = void 0;
				throw error;
			});
			return engineLoad;
		}
		/**
		 * Ask the host half why the engine is unavailable.
		 * @returns the host's explanation, or a generic one.
		 */
		async function engineStatus() {
			try {
				const response = await fetch(ENGINE_STATUS, { cache: "no-store" });
				const body = await response.json();
				return typeof body.detail === "string" ? body.detail : String(body.error ?? response.status);
			} catch {
				return "";
			}
		}
		/**
		 * Serialize one document without mounting an editor.
		 *
		 * The gate needs the engine's own opinion of the file before the pane
		 * decides which mode to open in; a detached container is enough, and the
		 * probe is destroyed immediately.
		 * @param engine - the loaded engine namespace.
		 * @param text - the file's text as read.
		 * @returns the serialization, or undefined when the probe throws.
		 */
		function probeSerialization(engine, text) {
			let probe;
			try {
				probe = new engine.Muya(document.createElement("div"), { markdown: text });
				return probe.getMarkdown();
			} catch {
				return void 0;
			} finally {
				if (probe !== void 0 && typeof probe.destroy === "function") {
					try {
						probe.destroy();
					} catch {}
				}
			}
		}
		/**
		 * Pick the engine's own locale object for one product locale id.
		 * @param engine - the loaded engine namespace.
		 * @param localeId - the active product locale id.
		 * @returns the engine locale, or undefined to keep the engine default.
		 */
		function engineLocale(engine, localeId) {
			const id = String(localeId ?? "").toLowerCase();
			if (id.startsWith("zh-tw") || id.startsWith("zh-hant")) return engine.zhTW;
			if (id.startsWith("zh")) return engine.zh;
			if (id.startsWith("ja")) return engine.ja;
			if (id.startsWith("ko")) return engine.ko;
			if (id.startsWith("es")) return engine.es;
			if (id.startsWith("fr")) return engine.fr;
			if (id.startsWith("de")) return engine.de;
			if (id.startsWith("pt")) return engine.pt;
			if (id.startsWith("en")) return engine.en;
			return void 0;
		}
		//#endregion
		//#region draft
		/** The file's text as one string, decoded from the whole-file byte read. */
		function decodeText(base64) {
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
			return new TextDecoder("utf-8").decode(bytes);
		}
		/**
		 * Count how far one serialization moved from the bytes that were on disk.
		 *
		 * A hint, not a diff: it answers "did saving this draft touch lines other
		 * than the ones I typed in", which is the question a user asks about a
		 * canonicalizing editor.
		 * @param original - the text the file was read as.
		 * @param next - the text about to be written.
		 * @returns the removed and added line counts.
		 */
		function lineDrift(original, next) {
			const before = new Map();
			for (const line of original.split("\n")) before.set(line, (before.get(line) ?? 0) + 1);
			let added = 0;
			for (const line of next.split("\n")) {
				const left = before.get(line) ?? 0;
				if (left > 0) before.set(line, left - 1);
				else added += 1;
			}
			let removed = 0;
			for (const left of before.values()) removed += left;
			return {
				removed,
				added
			};
		}
		//#endregion
		//#region locales
		/** Simplified Chinese dictionary, the key-set source of truth. */
		const zh = {
			loading: "正在载入编辑器…",
			engineFailed: "编辑器引擎载入失败：{reason}（仍可用源码模式编辑）",
			readFailed: "无法读取文件（{code}）。",
			tooLarge: "这个文件太大，编辑器无法整文件载入。",
			unsupported: "这个地址不是工作区里的 Markdown 文件。",
			retry: "重试",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			source: "源码模式",
			rendered: "所见即所得",
			toSource: "切到源码模式",
			toRendered: "切到所见即所得（会规范化部分格式）",
			dirty: "未保存的改动",
			noChange: "没有改动，未写入文件。",
			gate: "这个文件在所见即所得模式下会被改写（引擎会规范化表格对齐、列表缩进、空行等），已用源码模式打开。",
			gateSwitch: "仍要用所见即所得打开",
			gateSave: "提醒：本次保存会改动 {added} 行、删除 {removed} 行，其中包含引擎的格式规范化。",
			stale: "文件已被外部修改（例如 agent 刚写过）。重新载入会丢弃你的草稿。",
			recovered: "已恢复未保存的草稿，保存时仍会检查原文件版本。",
			confirmDiscard: "放弃未保存的修改？",
			compare: "读取磁盘内容并保留草稿",
			disk: "磁盘上的当前内容",
			resolved: "已合并修改，使用当前文件版本",
			reload: "放弃草稿并重新载入",
			saveFailed: "保存失败（{code}）：{message}",
			drift: "本次保存改动 {added} 行、删除 {removed} 行。",
			dirtyHint: "Ctrl/Cmd+S 保存"
		};
		/** English dictionary with the same keys as the Chinese one. */
		const en = {
			loading: "Loading editor…",
			engineFailed: "The editor engine failed to load: {reason} (source editing still works)",
			readFailed: "The file could not be read ({code}).",
			tooLarge: "This file is too large for the editor to load whole.",
			unsupported: "This address is not a Markdown file in the workspace.",
			retry: "Retry",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			source: "Source mode",
			rendered: "Rendered",
			toSource: "Switch to source mode",
			toRendered: "Switch to rendered editing (canonicalizes some formatting)",
			dirty: "Unsaved changes",
			noChange: "Nothing changed, so nothing was written.",
			gate: "The rendered editor would rewrite this file (the engine canonicalizes table padding, list indentation and blank lines), so it opened in source mode.",
			gateSwitch: "Open in rendered mode anyway",
			gateSave: "Heads up: this save changes {added} and removes {removed} line(s), including the engine's format canonicalization.",
			stale: "The file changed outside this pane (an agent may have written it). Reloading discards your draft.",
			recovered: "Your unsaved draft was restored. Saving still checks the original file version.",
			confirmDiscard: "Discard unsaved changes?",
			compare: "Read disk content and keep draft",
			disk: "Current disk content",
			resolved: "I have merged the changes; use this file version",
			reload: "Discard draft and reload",
			saveFailed: "Save failed ({code}): {message}",
			drift: "This save changed {added} and removed {removed} line(s).",
			dirtyHint: "Ctrl/Cmd+S to save"
		};
		//#endregion
		//#region pane
		/** JSX-free element constructor, so the bundle needs the react table entry alone. */
		const h = react.createElement;
		/**
		 * One Markdown tab: the toolbar, the engine, and the guarded save.
		 *
		 * The file is read whole through the product's own Remote, because a
		 * Markdown file is UTF-8 text and the version-guarded write is exactly the
		 * contract this pane needs; a file past the host's whole-file cap is
		 * reported rather than partially loaded, since a partial draft would be
		 * written back over the whole file.
		 * @param props - the tab hook, copy, the read/write face, and the locale picker.
		 * @returns the tab's body.
		 */
		function MarkdownPane({ useTabInfo, t, face }) {
			const { tab } = useTabInfo();
			const file = (0, react.useMemo)(() => sessionFileOf(tab.contentId), [tab.contentId]);
			const signal = tab.signal;
			const containerRef = (0, react.useRef)(null);
			const editorRef = (0, react.useRef)(null);
			const engineRef = (0, react.useRef)(null);
			const dirtyRef = (0, react.useRef)(false);
			const draftRef = (0, react.useRef)("");
			const baselineRef = (0, react.useRef)({ original: "", version: void 0 });
			const editRevisionRef = (0, react.useRef)(0);
			const documentRef = (0, react.useRef)(null);
			const saveRef = (0, react.useRef)(null);
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [phase, setPhase] = (0, react.useState)("loading");
			const [failure, setFailure] = (0, react.useState)("");
			const [version, setVersion] = (0, react.useState)(void 0);
			const [original, setOriginal] = (0, react.useState)("");
			const [draft, setDraft] = (0, react.useState)("");
			const [dirty, setDirty] = (0, react.useState)(false);
			const [mode, setMode] = (0, react.useState)("source");
			const [gated, setGated] = (0, react.useState)(false);
			const [engineFailed, setEngineFailed] = (0, react.useState)("");
			const [note, setNote] = (0, react.useState)(void 0);
			const [saving, setSaving] = (0, react.useState)(false);
			const [savedAt, setSavedAt] = (0, react.useState)(0);
			const [disk, setDisk] = (0, react.useState)(void 0);
			const markDirty = (text) => {
				draftRef.current = text;
				editRevisionRef.current += 1;
				dirtyRef.current = true;
				setDirty(true);
				setSavedAt(0);
				if (file !== void 0) face.remember(file, { ...baselineRef.current, text });
			};
			/**
			 * Read the file, then let the engine's own serialization decide the mode.
			 *
			 * The gate is the whole reason a drifting file is not rewritten by
			 * accident: when the engine's serialization differs from the bytes on
			 * disk, the pane opens in source mode instead of a mode whose first save
			 * would reformat the file.
			 */
			(0, react.useEffect)(() => {
				if (file === void 0 || signal === void 0) return void 0;
				let live = true;
				const document = {};
				documentRef.current = document;
				saveRef.current = null;
				editRevisionRef.current = 0;
				dirtyRef.current = false;
				setSaving(false);
				setSavedAt(0);
				setPhase("loading");
				setFailure("");
				setDirty(false);
				setNote(void 0);
				setDraft("");
				setOriginal("");
				setVersion(void 0);
				setGated(false);
				setDisk(void 0);
				(async () => {
					const recovered = face.recover(file);
					const read = await face.read(file, signal);
					if (!live) return;
					if (!read.ok) {
						setFailure(read.error.code === "workspace-file/too-large" ? "too-large" : read.error.code);
						if (recovered !== void 0) {
							baselineRef.current = { original: recovered.original, version: recovered.version };
							draftRef.current = recovered.text;
							dirtyRef.current = true;
							setOriginal(recovered.original);
							setDraft(recovered.text);
							setVersion(recovered.version);
							setDirty(true);
							setMode("source");
							setNote(t("readFailed", { code: read.error.code }));
							setPhase("ready");
							return;
						}
						setPhase("failed");
						return;
					}
					const text = recovered?.text ?? read.value.text;
					const baseline = recovered?.original ?? read.value.text;
					const guard = recovered?.version ?? read.value.version;
					baselineRef.current = { original: baseline, version: guard };
					draftRef.current = text;
					setOriginal(baseline);
					setDraft(text);
					setVersion(guard);
					if (recovered !== void 0) {
						dirtyRef.current = true;
						setDirty(true);
						setNote(t("recovered"));
						if (guard !== read.value.version) {
							setFailure("workspace-file/stale");
							setDisk(read.value);
						}
						setMode("source");
						setPhase("ready");
						return;
					}
					let engine;
					try {
						engine = await loadEngine();
					} catch (error) {
						if (!live) return;
						const reason = await engineStatus();
						const detail = reason === "" ? String(error && error.message ? error.message : error) : reason;
						if (!live) return;
						engineRef.current = void 0;
						setEngineFailed(detail);
						setMode("source");
						setNote(t("engineFailed", { reason: detail }));
						setPhase("ready");
						return;
					}
					if (!live) return;
					engineRef.current = engine;
					setEngineFailed("");
					const serialized = probeSerialization(engine, text);
					const safe = serialized !== void 0 && serialized === text;
					setGated(!safe);
					setMode(safe ? "rendered" : "source");
					setNote(safe ? void 0 : t("gate"));
					setPhase("ready");
				})().catch((error) => {
					if (!live) return;
					setFailure(String(error && error.message ? error.message : error));
					setPhase("failed");
				});
				return () => {
					live = false;
					if (documentRef.current === document) documentRef.current = null;
				};
			}, [
				file === void 0 ? "" : file.sessionId + "\u0000" + file.path,
				signal,
				attempt
			]);
			// The engine owns the container between mounts, so it is created once per
			// (document, mode) pair and torn down before anything else touches the node.
			// A save is deliberately NOT a remount: `version` moving after a write must
			// not rebuild the editor the user is typing in.
			(0, react.useEffect)(() => {
				if (phase !== "ready" || mode !== "rendered") return void 0;
				const container = containerRef.current;
				const engine = engineRef.current;
				if (container === null || engine === void 0) return void 0;
				let editor;
				try {
					editor = new engine.Muya(container, { markdown: draft });
					const locale = engineLocale(engine, face.localeId());
					if (locale !== void 0) editor.locale(locale);
					editor.on("json-change", () => markDirty(editor.getMarkdown()));
					editor.init();
					editorRef.current = editor;
				} catch (error) {
					editorRef.current = void 0;
					setEngineFailed(String(error && error.message ? error.message : error));
					setNote(t("engineFailed", { reason: String(error && error.message ? error.message : error) }));
					setMode("source");
				}
				return () => {
					editorRef.current = void 0;
					if (editor !== void 0) {
						try {
							editor.destroy();
						} catch {}
					}
					// A destroy leaves the engine's own nodes behind, so the container the
					// next mount receives is emptied here rather than reused as-is.
					if (container !== null) container.replaceChildren();
				};
			}, [
				phase,
				mode,
				attempt
			]);
			const serialized = () => {
				if (mode === "source") return draft;
				const editor = editorRef.current;
				if (editor === void 0) return draft;
				try {
					return editor.getMarkdown();
				} catch {
					return draft;
				}
			};
			const save = () => {
				if (file === void 0 || signal === void 0 || version === void 0 || phase !== "ready" || saveRef.current !== null || disk !== void 0) return;
				if (!dirtyRef.current) {
					setNote(t("noChange"));
					return;
				}
				const text = serialized();
				const drift = lineDrift(original, text);
				const document = documentRef.current;
				const revision = editRevisionRef.current;
				const operation = {};
				saveRef.current = operation;
				const current = () => documentRef.current === document && saveRef.current === operation;
				setSaving(true);
				face.write(file, text, version, signal).then((result) => {
					if (!current()) return;
					saveRef.current = null;
					setSaving(false);
					if (!result.ok) {
						setFailure(result.error.code);
						setNote(t("saveFailed", {
							code: result.error.code,
							message: String(result.error.message ?? "")
						}));
						return;
					}
					// A successful write acknowledges only the submitted revision. Later
					// edits remain in the editor and use the returned version on save.
					const changed = editRevisionRef.current !== revision;
					dirtyRef.current = changed;
					setDirty(changed);
					setOriginal(text);
					if (!changed) setDraft(text);
					setVersion(result.value.version);
					baselineRef.current = { original: text, version: result.value.version };
					face.remember(file, { ...baselineRef.current, text: changed ? draftRef.current : text });
					setFailure("");
					setSavedAt(changed ? 0 : Date.now());
					setNote(drift.added + drift.removed === 0 ? t("saved") : (mode === "rendered" && gated ? t("gateSave", drift) : t("drift", drift)));
				}).catch((error) => {
					if (!current()) return;
					saveRef.current = null;
					setSaving(false);
					setNote(String(error && error.message ? error.message : error));
				});
			};
			const onKeyDown = (event) => {
				if (event.key !== "s" && event.key !== "S") return;
				if (!event.metaKey && !event.ctrlKey) return;
				event.preventDefault();
				save();
			};
			const toggleMode = () => {
				if (mode === "rendered") {
					const current = serialized();
					setDraft(current);
					setMode("source");
					return;
				}
				if (engineRef.current === void 0) return;
				setNote(gated ? t("gate") : note);
				setMode("rendered");
			};
			const reload = () => {
				if (dirtyRef.current && !window.confirm(t("confirmDiscard"))) return;
				if (file !== void 0) face.forget(file);
				dirtyRef.current = false;
				setAttempt((value) => value + 1);
			};
			const compare = () => {
				if (file === void 0 || signal.aborted) return;
				const document = documentRef.current;
				face.read(file, signal).then(result => {
					if (documentRef.current !== document || !result.ok) return;
					setDisk(result.value);
				});
			};
			const { directory, name } = pathPartsOf(file === void 0 ? tab.contentId : file.path);
			const displayPath = file === void 0 ? tab.contentId : file.path;
			const stale = failure === "workspace-file/stale";
			const blocked = phase === "failed";
			const failureMessage = failure === "too-large" || failure === "workspace-file/too-large" ? t("tooLarge") : failure.startsWith("engine-") ? t("engineFailed", { reason: failure }) : t("readFailed", { code: failure });
			return h("div", {
				className: css.pane,
				"data-markdown-editor": tab.contentId,
				onKeyDown
			}, h("div", { className: css.header },
				dirty ? h("span", { className: css.dirty, "data-markdown-dirty": true, title: t("dirty"), "aria-label": t("dirty") }) : null,
				h("span", {
					className: css.path,
					title: displayPath
				}, h("span", { className: css.name }, name), directory === "" ? null : directory),
				h("button", {
					type: "button",
					className: css.tool,
					title: mode === "rendered" ? t("toSource") : t("toRendered"),
					"aria-label": mode === "rendered" ? t("toSource") : t("toRendered"),
					"data-markdown-mode": mode,
					disabled: blocked || (mode === "source" && (engineRef.current === void 0 || engineFailed !== "")),
					onClick: toggleMode
				}, mode === "rendered" ? t("source") : t("rendered")),
				h("button", {
					type: "button",
					className: css.tool,
					title: t("dirtyHint"),
					"aria-label": t("save"),
					"data-markdown-save": dirty ? "dirty" : "clean",
					disabled: blocked || saving || disk !== void 0,
					onClick: save
				}, saving ? t("saving") : savedAt !== 0 && !dirty ? t("saved") : t("save"))),
			stale ? h("p", {
				className: css.note,
				"data-tone": "error",
				"data-markdown-note": "stale"
			}, t("stale"), h("button", {
				type: "button",
				className: css.retry,
				"data-markdown-compare": true,
				onClick: compare
			}, t("compare")), h("button", {
				type: "button",
				className: css.retry,
				"data-markdown-reload": true,
				onClick: reload
			}, t("reload"))) : note !== void 0 ? h("p", {
				className: css.note,
				"data-tone": gated && mode === "source" ? "warn" : "plain",
				"data-markdown-note": gated && mode === "source" ? "gate" : "message"
			}, note, gated && mode === "source" && engineRef.current !== void 0 ? h("button", {
				type: "button",
				className: css.retry,
				"data-markdown-gate-switch": true,
				onClick: () => {
					setNote(void 0);
					setMode("rendered");
				}
			}, t("gateSwitch")) : null) : null,
			disk !== void 0 ? h("details", { className: css.note, open: true, "data-markdown-conflict": true },
				h("summary", null, t("disk")), h("pre", { style: { maxHeight: "25vh", overflow: "auto", whiteSpace: "pre-wrap" } }, disk.text),
				h("button", { type: "button", className: css.retry, "data-markdown-resolve": true, onClick: () => {
					const text = serialized();
					baselineRef.current = { original: disk.text, version: disk.version };
					draftRef.current = text;
					face.remember(file, { ...baselineRef.current, text });
					setOriginal(disk.text);
					setVersion(disk.version);
					setDraft(text);
					setFailure("");
					setDisk(void 0);
				} }, t("resolved"))) : null,
			file === void 0 || signal === void 0 ? h("div", {
				className: css.status,
				role: "alert"
			}, h("p", { className: css.message }, t("unsupported"))) : null,
			blocked ? h("div", {
				className: css.status,
				role: "alert",
				"data-markdown-failed": failure
			}, h("p", { className: css.message }, failureMessage),
				h("button", {
					type: "button",
					className: css.retry,
					"data-markdown-retry": true,
					onClick: reload
				}, t("retry"))) : null,
			phase === "loading" && file !== void 0 ? h("div", { className: css.status }, h("p", { className: css.message }, t("loading"))) : null,
			!blocked && phase === "ready" ? h("div", { className: css.body },
				mode === "source" ? h("textarea", {
					className: css.source,
					value: draft,
					spellCheck: false,
					"aria-label": t("source"),
					"data-markdown-source": true,
					onChange: (event) => {
						setDraft(event.target.value);
						markDirty(event.target.value);
					}
				}) : h("div", {
					className: css.editor,
					ref: containerRef,
					"data-markdown-editor-host": true
				})) : null);
		}
		//#endregion
		//#region plugin
		/** This package's copy namespace. */
		const NS = "sidebarMarkdown";
		/** This implementation's identity in the tab system, and the key its body registers under. */
		const TAB_ID = "@local/dsh-client-ui-markdown";
		/**
		 * Type discriminator for editable Markdown tabs.
		 *
		 * A fresh kind rather than a takeover of the document preview's `text`
		 * kind: a type in the `extension` band outranks the `fallback` viewer on
		 * its own globs, so `.md` never reaches the read-only preview.
		 */
		const TAB_KIND = "markdown";
		/** Required browser services: the tab-type registry, slots, copy, and the file Remote. */
		const inject = [
			"slots",
			"locale",
			"sidebarRight",
			"sidebarRightTabs",
			"remote",
			"remote.workspaceFiles"
		];
		/**
		 * Client plugin body: register the type, its dictionary, and its tab body.
		 * @param ctx - client root context carrying the registry, slots, copy, and the Remote face.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			const drafts = new Map();
			const saving = new Set();
			const keyOf = file => "dsh.markdown.draft.v1." + encodeURIComponent(file.sessionId) + "." + encodeURIComponent(file.path);
			const recover = file => {
				const key = keyOf(file);
				if (drafts.has(key)) return drafts.get(key);
				try {
					const value = JSON.parse(localStorage.getItem(key) ?? "null");
					if (value === null || value.schema !== 1 || typeof value.text !== "string" || typeof value.original !== "string"
						|| typeof value.version !== "string" || value.text === value.original) return void 0;
					drafts.set(key, value);
					return value;
				} catch (error) {
					console.error("Markdown draft recovery failed:", error);
					return void 0;
				}
			};
			const forget = file => {
				const key = keyOf(file);
				drafts.delete(key);
				try { localStorage.removeItem(key); }
				catch (error) { console.error("Markdown draft cleanup failed:", error); }
			};
			const remember = (file, draft) => {
				if (draft.version === void 0) return;
				if (draft.text === draft.original) { forget(file); return; }
				const key = keyOf(file);
				const value = { schema: 1, ...draft };
				drafts.set(key, value);
				try { localStorage.setItem(key, JSON.stringify(value)); }
				catch (error) { console.error("Markdown draft persistence failed:", error); }
			};
			ctx.effect(() => {
				const release = ctx.sidebarRight.registerCloseHandler(TAB_KIND, (_session, tab) => {
					const file = sessionFileOf(tab.contentId);
					if (file === void 0) return true;
					if (saving.has(keyOf(file))) return false;
					if (recover(file) !== void 0 && !window.confirm(t("confirmDiscard"))) return false;
					forget(file);
					return true;
				});
				const beforeUnload = event => {
					if (drafts.size === 0) return;
					event.preventDefault();
					event.returnValue = "";
				};
				window.addEventListener("beforeunload", beforeUnload);
				return () => { release(); window.removeEventListener("beforeunload", beforeUnload); };
			}, "sidebar-markdown: draft recovery and close protection");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "sidebar-markdown: dictionaries");
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: TAB_ID,
				kind: TAB_KIND,
				patterns: MARKDOWN_PATTERNS,
				canOpen: (address) => sessionFileOf(address) !== void 0,
				title: (address) => pathPartsOf(sessionFileOf(address)?.path ?? address).name
			}), "sidebar-markdown: tab type");
			// The read/write face and the locale picker are closed over here: a pane
			// component receives data and callbacks, never the plugin context.
			const face = {
				recover, remember, forget,
				read: async (file, signal) => {
					const result = await ctx.remote.workspaceFiles.readAll(file.sessionId, file.path, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: {
							text: decodeText(result.value.data),
							version: result.value.version
						}
					};
				},
				write: (file, text, version, signal) => {
					const key = keyOf(file);
					saving.add(key);
					return ctx.remote.workspaceFiles.write(file.sessionId, file.path, text, version, signal).finally(() => saving.delete(key));
				},
				localeId: () => ctx.locale.getLocale().active
			};
			const Pane = (props) => h(MarkdownPane, Object.assign({}, props, { face }));
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TAB_ID,
				locale: NS
			}, Pane)), "sidebar-markdown: body");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
