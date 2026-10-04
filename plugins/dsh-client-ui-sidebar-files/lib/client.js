window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-sidebar-files",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region lib/types/client/definition.js
		/** The tab kind this package owns. */
		const FILES_KIND = "files";
		/** This implementation's identity in the tab system, and the key its body registers under. */
		const FILES_ID = "@deepseek-ai/dsh-client-ui-sidebar-files";
		/** The type's coloured folder sheet at the guide capsule's glyph size, as the chip title draws it. */
		function FolderSheetGlyph({ size, className }) {
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
				kind: "folder",
				size,
				className
			});
		}
		/**
		* The files type's registry definition.
		* @param t - namespace-bound translate, read fresh on every label call.
		* @returns the definition to register.
		*/
		function filesDefinition(t) {
			return {
				id: FILES_ID,
				kind: FILES_KIND,
				priority: "builtin",
				title: () => t("type.label"),
				guide: [{
					id: "workspace",
					order: 10,
					title: () => t("guide.title"),
					description: () => t("guide.description"),
					icon: FolderSheetGlyph
				}]
			};
		}
		//#endregion
		//#region lib/types/client/paths.js
		/**
		* Path arithmetic the tree's rows and menus need: the last segment, the parent
		* directory, and a path relative to the tab's root.
		*
		* Every path here is one the tree keys a row by (`face.ts`'s `childPath`), so
		* `/` is the separator the tree mints itself; a Host-reported path may also
		* carry `\`, and both are read.
		*/
		/**
		* The last segment of a path: a row's display name, and the name a rename
		* dialog pre-fills.
		* @param path - absolute path.
		* @returns the last segment, or the path itself when it has none.
		*/
		function entryName(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			if (trimmed === "") return path;
			const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return trimmed.slice(at + 1);
		}
		/**
		* The parent directory of a path.
		* @param path - absolute path.
		* @returns the parent's absolute path, or the path itself when it has no parent.
		*/
		function parentPath(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			if (at < 0) return path;
			if (at === 0) return trimmed.slice(0, 1);
			const parent = trimmed.slice(0, at);
			return parent.endsWith(":") ? `${parent}\\` : parent;
		}
		/**
		* A path as the tree's root sees it.
		* @param root - absolute path the tab is rooted at.
		* @param path - absolute path of the entry.
		* @returns the path relative to the root; unchanged when it lies outside.
		*/
		function relativeToRoot(root, path) {
			const base = root.replace(/[/\\]+$/, "");
			if (path === root) return "";
			return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
		}
		//#endregion
		//#region lib/types/client/upload.js
		/**
		* Turning a file the reader dropped or picked into the base64 payload the
		* upload endpoint takes.
		*
		* The wire carries bytes as base64 in both directions (`readAll` answers with
		* it, `upload` takes it), so this is the download path's decode run backwards.
		* Nothing here streams: a file is read whole, encoded whole, and sent as one
		* request under the Host's complete-file cap.
		*/
		/**
		* Encode bytes as base64.
		*
		* `String.fromCharCode` is applied in blocks rather than to the whole array:
		* spreading a multi-megabyte array into an argument list overflows the call
		* stack, which is exactly the size an upload reaches.
		* @param bytes - the file's contents.
		* @returns the base64 payload to send.
		*/
		function base64Of(bytes) {
			const CHUNK = 32768;
			let binary = "";
			for (let at = 0; at < bytes.length; at += CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
			return btoa(binary);
		}
		/**
		* The files one drop or pick carried.
		*
		* A `DataTransfer.files` is a `FileList` and a file input's `files` is one too,
		* but the two arrive through different handlers; this is the one shape both are
		* read as.
		* @param files - what the gesture delivered, or null when it carried none.
		* @returns the files, in the order they were offered.
		*/
		function filesOf(files) {
			return files === null ? [] : Array.from(files);
		}
		//#endregion
		//#region lib/types/client/face.js
		/** How many lines of each file a comparison reads; the rest is reported as cut. */
		const COMPARE_PAGE_LINES = 2e3;
		/**
		* Bind the tree's Remote calls to one Client Remote face, keeping only what the
		* tree and its dialogs use: an entry never reaches a tree or a dialog, a page
		* drops the stat it travels with, and a move keeps the destination and the
		* entries it produced.
		* @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
		* @returns the Remote calls the tree's face performs.
		*/
		function createFilesRemote(remote) {
			const files = remote.workspaceFiles;
			return {
				list: async (sessionId, path, signal) => {
					const result = await files.list(sessionId, path, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: {
							entries: result.value.entries,
							truncated: result.value.truncated
						}
					};
				},
				readPage: async (sessionId, path, signal) => {
					const result = await files.read(sessionId, path, { limit: COMPARE_PAGE_LINES }, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: {
							text: result.value.text,
							eof: result.value.eof
						}
					};
				},
				download: async (sessionId, path, signal) => {
					const result = await files.readAll(sessionId, path, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: {
							name: entryName(path),
							base64: result.value.data
						}
					};
				},
				rename: async (sessionId, path, newName, signal) => {
					const result = await files.rename(sessionId, path, newName, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: { absolutePath: result.value.absolutePath }
					};
				},
				remove: async (sessionId, path, signal) => {
					const result = await files.delete(sessionId, path, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: { absolutePath: result.value.absolutePath }
					};
				},
				move: (sessionId, paths, destination, signal) => files.move(sessionId, paths, destination, signal),
				upload: async (sessionId, path, base64, signal) => {
					const result = await files.upload(sessionId, path, base64, signal);
					if (!result.ok) return result;
					return {
						ok: true,
						value: { absolutePath: result.value.absolutePath }
					};
				},
				history: (sessionId, path, signal) => files.history(sessionId, path, signal)
			};
		}
		/**
		* The absolute path of one child entry.
		*
		* Joined with `/` whatever the parent's separators: the Host resolves mixed
		* separators, and the tree only needs a stable key.
		* @param parent - absolute path of the listed directory.
		* @param name - the entry's basename.
		* @returns the child's absolute path.
		*/
		function childPath(parent, name) {
			return `${parent.replace(/[/\\]+$/, "")}/${name}`;
		}
		/**
		* Bind the tree's face to one Remote face and one home resolver.
		* @param ops - the Remote calls, already adapted to what the tree stores.
		* @param home - reads the Host account's home directory; undefined until it is known.
		* @returns the Slot `inject` factory: session and bound actions in, face out.
		*/
		function filesFace(ops, home) {
			return (sessionId, actions) => {
				/** Per tab, per absolute path: the listing generation a settlement must match; the latest request wins. */
				const generations = /* @__PURE__ */ new Map();
				/** Per tab: the tail of that tab's upload queue, so one file is read at a time. */
				const uploads = /* @__PURE__ */ new Map();
				const nextGeneration = (tabId, path) => {
					const byPath = generations.get(tabId) ?? /* @__PURE__ */ new Map();
					generations.set(tabId, byPath);
					const generation = (byPath.get(path) ?? 0) + 1;
					byPath.set(path, generation);
					return generation;
				};
				const load = (tabId, path, signal) => {
					if (signal.aborted) return;
					const generation = nextGeneration(tabId, path);
					actions.loading(tabId, path);
					ops.list(sessionId, path, signal).then((result) => {
						if (generations.get(tabId)?.get(path) !== generation) return;
						if (result.ok) actions.loaded(tabId, path, result.value);
						else actions.failed(tabId, path, result.error);
					});
				};
				return {
					start(tabId, root, signal) {
						actions.start(tabId, root);
						signal.addEventListener("abort", () => {
							generations.delete(tabId);
							uploads.delete(tabId);
							actions.forget(tabId);
						}, { once: true });
						load(tabId, root, signal);
					},
					navigate(tabId, root, signal) {
						if (signal.aborted) return;
						actions.navigate(tabId, root);
						load(tabId, root, signal);
					},
					load,
					toggle(tabId, path, loaded, signal) {
						actions.toggled(tabId, path);
						if (!loaded) load(tabId, path, signal);
					},
					upload(tabId, dir, file, signal) {
						const path = childPath(dir, file.name);
						const queued = (uploads.get(tabId) ?? Promise.resolve()).then(async () => {
							if (signal.aborted) return void 0;
							const bytes = new Uint8Array(await file.arrayBuffer());
							const result = await ops.upload(sessionId, path, base64Of(bytes), signal);
							return signal.aborted ? void 0 : result;
						});
						uploads.set(tabId, queued.catch(() => void 0));
						return queued;
					},
					rename: (path, newName, signal) => ops.rename(sessionId, path, newName, signal),
					remove: (path, signal) => ops.remove(sessionId, path, signal),
					move: (paths, destination, signal) => ops.move(sessionId, paths, destination, signal),
					download: (path, signal) => ops.download(sessionId, path, signal),
					readPage: (path, signal) => ops.readPage(sessionId, path, signal),
					history: (path, signal) => ops.history(sessionId, path, signal),
					homePath: home
				};
			};
		}
		//#endregion
		//#region vendor/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region ../../util/workspace-path/src/file-address.ts
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Component-encode one id or path segment, keeping `:` literal for drive letters. */
		function encodeSegment(segment) {
			return encodeURIComponent(segment).replace(/%3A/gi, ":");
		}
		/** Encode a `/`-separated path segment by segment. */
		function encodePath(path) {
			return path.split("/").map(encodeSegment).join("/");
		}
		/**
		* Build the address of a file read through one Session.
		* @param sessionId - the Session whose Host workspace resolves the path.
		* @param path - absolute or workspace-relative path; backslashes are normalized to `/`, and leading `./` prefixes are dropped.
		* @returns the `dsh-resource://file/session/<sessionId>/<path>` address.
		*/
		function sessionFileAddress(sessionId, path) {
			const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
			return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
		}
		//#endregion
		//#region ../../util/workspace-path/src/index.ts
		/**
		* Browser-safe Workspace path and display helpers.
		* @module @deepseek-ai/dsh-util-workspace-path
		*/
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Whether a path is absolute in either spelling the Host accepts: POSIX (`/a/b`) or Windows drive or UNC.
		* @param path - the path to classify.
		* @returns `true` for an absolute path; `false` for a Workspace-relative one.
		*/
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* Split a path for display: the directories through their last separator, and
		* the final segment after it. Both `/` and `\` separate, so a Windows path
		* splits where its own segments end; trailing separators are dropped first, so
		* a directory path names its own last segment. A path with no separator, or a
		* separator-only path, is all name.
		* @param path - file or directory path using POSIX or Windows separators.
		* @returns the directory prefix (possibly empty) and the final segment.
		*/
		function pathPartsOf(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			if (trimmed === "") return {
				directory: "",
				name: path
			};
			const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1;
			return {
				directory: trimmed.slice(0, cut),
				name: trimmed.slice(cut)
			};
		}
		/**
		* The address for a path as a caller holds it: a relative path, or an absolute
		* path inside the Session's workspace, becomes a `session`-scoped address; an
		* absolute path outside it, or one whose workspace root is unknown, keeps its
		* absolute path in that Session's address.
		* @param sessionId - the Session the path is read in.
		* @param cwd - that Session's workspace root, when known.
		* @param path - absolute or workspace-relative path, in either separator spelling.
		* @returns the `dsh-resource://file/…` address.
		*/
		function fileAddressFor(sessionId, cwd, path) {
			const normalized = path.replace(/\\/g, "/");
			if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
			const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
			if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
			if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}
		//#endregion
		//#region lib/types/client/failures.js
		/**
		* Say why a directory could not be listed, in terms of the directory.
		* @param t - namespace-bound translate.
		* @param failure - the settled Remote failure.
		* @returns the line to show under the directory.
		*/
		function failureLine(t, failure) {
			switch (failure.code) {
				case "workspace-file/not-found": return t("error.notFound");
				case "workspace-file/outside-workspace": return t("error.outsideWorkspace");
				case "workspace-file/not-directory": return t("error.notDirectory");
				default: return t("error.unavailable", { message: failure.message });
			}
		}
		/**
		* Say why one upload was refused. A name already taken and a file over the cap
		* are the two the reader can act on — rename or delete first, or pick a smaller
		* file — and a policy refusal names the directory as the thing that refuses.
		* @param t - namespace-bound translate.
		* @param failure - the settled Remote failure.
		* @returns the line to show on the upload's row.
		*/
		function uploadFailureLine(t, failure) {
			switch (failure.code) {
				case "workspace-file/exists": return t("upload.exists");
				case "workspace-file/too-large": return t("upload.tooLarge");
				case "workspace-file/denied": return t("upload.denied");
				case "workspace-file/not-regular-file": return t("upload.notFile");
				default: return t("error.actionFailed", { message: failure.message });
			}
		}
		/**
		* Say why a gesture on one entry failed.
		* @param t - namespace-bound translate.
		* @param failure - the settled Remote failure.
		* @returns the line to show beside the entry.
		*/
		function actionFailureLine(t, failure) {
			if (failure.code === "workspace-file/too-large") return t("error.tooLarge");
			return t("error.actionFailed", { message: failure.message });
		}
		//#endregion
		//#region lib/types/client/download.js
		/** The Host route one browser download reads. */
		const WORKSPACE_DOWNLOAD_PATH = "/api/workspace.download";
		/** The browser's origin, with the null-origin fallback the Host's own client uses. */
		function hostBase() {
			const origin = globalThis.location?.origin;
			return origin !== void 0 && origin !== "null" ? origin : "http://dsh.internal";
		}
		/**
		* Whether this page can reach the Host's HTTP download route.
		*
		* A page served by the Host has an origin and reaches `/api` like any other
		* request. A `file://` shell (the Electron composition) has the null origin and
		* no HTTP server at all, so its downloads read the file through the Remote face
		* instead — capped, but working, which is what that shell had before the route.
		* @returns true when the route is reachable from this page.
		*/
		function httpDownloadsAvailable() {
			const origin = globalThis.location?.origin;
			return origin !== void 0 && origin !== "null" && origin !== "";
		}
		/**
		* The absolute download URL of one workspace file.
		* @param sessionId - the session whose workspace root a relative path resolves against.
		* @param path - absolute path, or a path relative to that workspace root.
		* @returns the URL to hand the browser.
		*/
		function downloadUrlFor(sessionId, path) {
			const url = new URL(WORKSPACE_DOWNLOAD_PATH, hostBase());
			url.searchParams.set("sessionId", String(sessionId));
			url.searchParams.set("path", path);
			return url.toString();
		}
		/**
		* Save one base64 payload the Remote face read as a download named `name`.
		*
		* This is the `file://` shell's path: the bytes arrived whole on the wire, so
		* they are decoded here and handed to the browser as one Blob URL.
		* @param name - the file name the browser offers.
		* @param base64 - the file's complete content, base64-encoded.
		*/
		function saveBase64File(name, base64) {
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
			const url = URL.createObjectURL(new Blob([bytes]));
			saveWithAnchor(url, name);
			URL.revokeObjectURL(url);
		}
		/**
		* One file's `HEAD` preflight against the download route.
		* @param url - the download URL.
		* @param signal - the tab record's lifetime.
		* @returns the settled response's status, without a body.
		*/
		async function headOf(url, signal) {
			const response = await fetch(url, {
				method: "HEAD",
				signal
			});
			return {
				ok: response.ok,
				status: response.status
			};
		}
		/**
		* Start one save with a synthetic anchor, which is how a browser is told to keep
		* a same-origin response instead of navigating to it.
		* @param url - the download URL.
		* @param name - the name the browser offers.
		*/
		function saveWithAnchor(url, name) {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = name;
			anchor.click();
		}
		/**
		* Download one file per request, in order, reporting the ones that could not
		* start. The gesture is sequential rather than concurrent: each save is a
		* browser navigation, and starting them together is what makes a browser
		* suppress the whole set.
		* @param files - the files the gesture selected, in the order to download them.
		* @param sessionId - the session whose workspace root a relative path resolves against.
		* @param signal - the tab record's lifetime; an abort ends the gesture silently.
		* @param carrier - the browser's two operations; the defaults use `fetch` and an anchor.
		* @returns how many saves started, and one line per file that did not.
		*/
		async function downloadFiles(files, sessionId, signal, carrier = {
			head: headOf,
			save: saveWithAnchor
		}) {
			const failures = [];
			let started = 0;
			for (const file of files) {
				if (signal.aborted) break;
				const url = downloadUrlFor(sessionId, file.path);
				let status;
				try {
					const head = await carrier.head(url, signal);
					if (signal.aborted) break;
					if (head.ok) {
						carrier.save(url, file.name);
						started += 1;
						continue;
					}
					status = head.status;
				} catch (error) {
					if (signal.aborted) break;
					failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
					continue;
				}
				failures.push(`${file.name}: HTTP ${status}`);
			}
			return {
				started,
				failures
			};
		}
		//#endregion
		//#region lib/types/client/drag.js
		/**
		* One tree row dragged onto a directory: which entries the gesture carries, and
		* which of them a move to that directory could actually do.
		*
		* The dragged paths travel on the drag's own data transfer under a private type,
		* so a drop can tell this tree's own gesture from files arriving from the
		* reader's machine — the two share every drop target. Nothing here touches the
		* DOM: a drag start encodes, a drop decodes, and the destination filter is a
		* pure decision the body acts on.
		*/
		/** The private drag type one tree row's own gesture carries. */
		const FILES_DRAG_MIME = "application/x-dsh-workspace-files+json";
		/**
		* Encode the paths one drag carries.
		* @param paths - absolute paths of the entries being dragged.
		* @returns the data transfer payload for {@link FILES_DRAG_MIME}.
		*/
		function encodeDragPaths(paths) {
			return JSON.stringify({ paths });
		}
		/**
		* Read the paths one drop carries, tolerating a payload this module did not
		* write: a drag from another origin, or one whose data the browser withheld.
		* @param payload - the data transfer value, or an empty string when absent.
		* @returns the paths, or an empty list when the payload is not this module's.
		*/
		function decodeDragPaths(payload) {
			if (payload.length === 0) return [];
			try {
				const paths = JSON.parse(payload).paths;
				if (!Array.isArray(paths)) return [];
				return paths.filter((path) => typeof path === "string" && path.length > 0);
			} catch (error) {
				if (error instanceof SyntaxError) return [];
				throw error;
			}
		}
		/**
		* Whether `path` lies below the directory `directory`.
		* @param directory - absolute path of the directory.
		* @param path - absolute path to test.
		* @returns true when the path is inside the directory rather than equal to it.
		*/
		function isBelow(directory, path) {
			const base = directory.replace(/[/\\]+$/, "");
			return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`);
		}
		/**
		* Which dragged entries a drop on `destination` would actually move.
		*
		* Three kinds drop out, because moving them is either unnecessary or
		* impossible: an entry already in that directory, the directory itself, and an
		* entry inside another dragged directory — which the folder being moved already
		* carries. What remains is what the Host is asked to move, so a gesture that
		* could do nothing sends no request at all.
		* @param paths - absolute paths the drag carried.
		* @param destination - absolute path of the directory it was dropped on.
		* @returns the paths to move, in the order they were dragged.
		*/
		function movablePaths(paths, destination) {
			const unique = [...new Set(paths)];
			return unique.filter((path) => path !== destination && parentPath(path) !== destination && !unique.some((other) => other !== path && isBelow(other, path)));
		}
		//#endregion
		//#region lib/types/client/selection.js
		/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
		const byName = new Intl.Collator(void 0, {
			numeric: true,
			sensitivity: "base"
		});
		/**
		* Order one level's entries for display: directories first, then everything
		* else, each group by name. The endpoint's order is a listing fact; this is the
		* reader's.
		* @param entries - the listing as the endpoint returned it.
		* @returns a new array, directories first, then by name within each group.
		*/
		function orderEntries(entries) {
			return [...entries].sort((left, right) => {
				const group = Number(right.type === "directory") - Number(left.type === "directory");
				return group !== 0 ? group : byName.compare(left.name, right.name);
			});
		}
		/**
		* Every selectable row the tree is showing right now, in display order: each
		* loaded level's entries, depth-first through the directories that are open.
		* An entry the endpoint calls neither a file nor a directory is not one of them,
		* because it cannot be opened, moved, or downloaded either.
		* @param state - this tab's tree.
		* @returns the absolute paths of the visible rows, in the order they are drawn.
		*/
		function visiblePaths(state) {
			const paths = [];
			const walk = (directory) => {
				const level = state.levels[directory];
				if (level === void 0 || level.kind !== "ready") return;
				for (const entry of orderEntries(level.level.entries)) {
					if (entry.type === "other") continue;
					const path = childPath(directory, entry.name);
					paths.push(path);
					if (entry.type === "directory" && state.expanded.includes(path)) walk(path);
				}
			};
			walk(state.root);
			return paths;
		}
		/**
		* The rows a Shift click selects: everything between the anchor and the clicked
		* row inclusive, in display order either way round. Without an anchor, or with
		* one that is no longer on screen, the click selects its own row alone.
		* @param order - the visible paths, in display order.
		* @param anchor - the path the range measures from, or null.
		* @param path - the row that was clicked.
		* @returns the paths to select, in display order.
		*/
		function rangeBetween(order, anchor, path) {
			const to = order.indexOf(path);
			const from = anchor === null ? -1 : order.indexOf(anchor);
			if (from < 0 || to < 0) return [path];
			return order.slice(Math.min(from, to), Math.max(from, to) + 1);
		}
		/**
		* Which selection gesture one click carries: a Ctrl/Cmd click toggles, a Shift
		* click extends, and anything else selects just the row it landed on. Ctrl/Cmd
		* wins when both are held, which is what every file manager does with them.
		* @param event - the click, read for its modifier keys.
		* @returns the gesture to apply.
		*/
		function selectionGesture(event) {
			if (event.metaKey || event.ctrlKey) return "toggle";
			if (event.shiftKey) return "range";
			return "plain";
		}
		/**
		* One entry as the listing that showed it reported it.
		*
		* The selection holds paths, so this is how a path becomes a name and a kind
		* again: the parent level is the only thing that knows them. A path no loaded
		* level holds — its directory was reloaded, or the entry is gone — resolves to
		* undefined, and a caller acting on a selection treats that as a reason not to.
		* @param state - this tab's tree.
		* @param path - absolute path of the entry.
		* @returns the entry, or undefined when no loaded level holds it.
		*/
		function entryAt(state, path) {
			const level = state.levels[parentPath(path)];
			if (level === void 0 || level.kind !== "ready") return void 0;
			const name = entryName(path);
			const entry = level.level.entries.find((candidate) => candidate.name === name);
			if (entry === void 0 || entry.type === "other") return void 0;
			return {
				path,
				name,
				kind: entry.type === "directory" ? "directory" : "file"
			};
		}
		/**
		* The entries one row menu acts on: the tab's whole selection while the row the
		* menu opened on is part of it, and that row alone otherwise.
		*
		* A selection this tree can no longer resolve in full is never acted on in part:
		* the menu falls back to its own row rather than moving, deleting, or
		* downloading fewer entries than it names.
		* @param state - this tab's tree.
		* @param target - the row the menu was opened on.
		* @returns the entries the menu's rows apply to, never empty.
		*/
		function menuTargets(state, target) {
			if (state.selected.length > 1 && state.selected.includes(target.path)) {
				const entries = state.selected.map((path) => entryAt(state, path));
				if (entries.every((entry) => entry !== void 0)) return entries;
			}
			return [{
				path: target.path,
				name: target.name,
				kind: target.kind
			}];
		}
		//#endregion
		//#region \0dsh-css:packages/client/ui-sidebar-files/src/client/FilesBody.module.css.mjs
		const css = ".ybSAsa_root{height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);flex-direction:column;flex:auto;line-height:1.5;display:flex}.ybSAsa_header{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l3);flex:none;align-items:center;gap:4px;height:38px;padding:0 6px;display:flex}.ybSAsa_path{min-width:0;color:inherit;font:inherit;text-align:left;white-space:nowrap;cursor:text;background:0 0;border:0;flex:auto;justify-content:flex-end;margin-right:12px;padding:0;font-size:12px;display:flex;overflow:hidden}.ybSAsa_pathInput{min-width:0;color:var(--dsw-alias-label-primary);font:inherit;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;flex:auto;margin-right:12px;padding:3px 6px;font-size:12px}.ybSAsa_path[data-files-path-clipped]{mask-image:linear-gradient(90deg,#0000,#000 28px)}.ybSAsa_pathText{flex:none;margin-right:auto}.ybSAsa_pathDirectory{color:var(--dsw-alias-label-tertiary)}.ybSAsa_pathName{color:var(--dsw-alias-label-primary)}.ybSAsa_body{scrollbar-gutter:stable;flex:auto;min-height:0;margin-right:2px;padding:8px 0 8px 8px;overflow:auto}.ybSAsa_body::-webkit-scrollbar-track{margin:2px}.ybSAsa_level{margin:0;padding:0;list-style:none}.ybSAsa_level .ybSAsa_level{padding-left:18px}.ybSAsa_item{margin:0;padding:0}.ybSAsa_row{width:100%;min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:10px;align-items:center;gap:6px;padding:5px 10px;display:flex}.ybSAsa_row:hover{background:var(--dsw-alias-interactive-bg-hover)}.ybSAsa_rowSelected,.ybSAsa_rowSelected:hover{background:var(--dsw-alias-interactive-bg-active)}.ybSAsa_icon{color:var(--dsw-alias-label-tertiary);flex:none}.ybSAsa_fileIcon{flex:none}.ybSAsa_name{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}.ybSAsa_other{color:var(--dsw-alias-label-tertiary);cursor:default}.ybSAsa_other:hover{background:0 0}.ybSAsa_note{color:var(--dsw-alias-label-tertiary);margin:0;padding:3px 10px;font-size:12px}.ybSAsa_status{flex-direction:column;padding:12px 10px;display:flex}.ybSAsa_statusLine{color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,13px);margin:0;line-height:1.6}.ybSAsa_tool{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:28px;flex:none;justify-content:center;align-items:center;padding:6px;line-height:1;display:inline-flex}.ybSAsa_tool svg{width:15px;height:15px}.ybSAsa_tool:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.ybSAsa_titleIcon{flex:none}.ybSAsa_locationLabel{align-items:baseline;gap:8px;min-width:0;display:flex}.ybSAsa_locationName{flex:none}.ybSAsa_locationPath{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.ybSAsa_notice{color:var(--dsw-alias-state-error-primary);flex:none;margin:0;padding:6px 16px;font-size:12px}.ybSAsa_dialogInput{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);font:inherit;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;padding:8px 10px;font-size:13px}.ybSAsa_dialogError{color:var(--dsw-alias-state-error-primary);margin:8px 0 0;font-size:12px}.ybSAsa_dialogNote{color:var(--dsw-alias-label-tertiary);margin:8px 0 0;font-size:12px}.ybSAsa_dangerButton{color:var(--dsw-alias-state-error-primary)}.ybSAsa_dangerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.ybSAsa_compareDialog{width:min(720px,100%)}.ybSAsa_timelineDialog{width:min(560px,100%)}.ybSAsa_comparePaths,.ybSAsa_timelinePath{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;margin-bottom:4px;font-size:12px}.ybSAsa_timelineList{max-height:320px;margin:0;padding:0;list-style:none;overflow:auto}.ybSAsa_timelineRow{border-bottom:.5px solid var(--dsw-alias-border-l3);flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding:6px 0;display:flex}.ybSAsa_timelineHash{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}.ybSAsa_timelineSubject{text-overflow:ellipsis;white-space:nowrap;flex:auto;min-width:0;overflow:hidden}.ybSAsa_timelineMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}.ybSAsa_timelineCounts{color:var(--dsw-alias-label-secondary);flex:none;margin-left:auto;font-size:12px}.ybSAsa_uploads{border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;max-height:30%;margin:0;padding:0;list-style:none;overflow:auto}.ybSAsa_upload{align-items:center;gap:8px;padding:4px 6px 4px 10px;font-size:12px;display:flex}.ybSAsa_uploadName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;overflow:hidden}.ybSAsa_uploadState{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.ybSAsa_dropTarget{background:var(--dsw-alias-interactive-bg-hover-accent,var(--dsw-alias-interactive-bg-hover));border-radius:6px}";
		const tagId = "@deepseek-ai/dsh-client-ui-sidebar-files/FilesBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-files";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var FilesBody_module_css_default = {
			"body": "ybSAsa_body",
			"compareDialog": "ybSAsa_compareDialog",
			"comparePaths": "ybSAsa_comparePaths",
			"dangerButton": "ybSAsa_dangerButton",
			"dialogError": "ybSAsa_dialogError",
			"dialogInput": "ybSAsa_dialogInput",
			"dialogNote": "ybSAsa_dialogNote",
			"dropTarget": "ybSAsa_dropTarget",
			"fileIcon": "ybSAsa_fileIcon",
			"header": "ybSAsa_header",
			"icon": "ybSAsa_icon",
			"item": "ybSAsa_item",
			"level": "ybSAsa_level",
			"locationLabel": "ybSAsa_locationLabel",
			"locationName": "ybSAsa_locationName",
			"locationPath": "ybSAsa_locationPath",
			"name": "ybSAsa_name",
			"note": "ybSAsa_note",
			"notice": "ybSAsa_notice",
			"other": "ybSAsa_other",
			"path": "ybSAsa_path",
			"pathDirectory": "ybSAsa_pathDirectory",
			"pathInput": "ybSAsa_pathInput",
			"pathName": "ybSAsa_pathName",
			"pathText": "ybSAsa_pathText",
			"root": "ybSAsa_root",
			"row": "ybSAsa_row",
			"rowSelected": "ybSAsa_rowSelected",
			"status": "ybSAsa_status",
			"statusLine": "ybSAsa_statusLine",
			"timelineCounts": "ybSAsa_timelineCounts",
			"timelineDialog": "ybSAsa_timelineDialog",
			"timelineHash": "ybSAsa_timelineHash",
			"timelineList": "ybSAsa_timelineList",
			"timelineMeta": "ybSAsa_timelineMeta",
			"timelinePath": "ybSAsa_timelinePath",
			"timelineRow": "ybSAsa_timelineRow",
			"timelineSubject": "ybSAsa_timelineSubject",
			"titleIcon": "ybSAsa_titleIcon",
			"tool": "ybSAsa_tool",
			"upload": "ybSAsa_upload",
			"uploadName": "ybSAsa_uploadName",
			"uploadState": "ybSAsa_uploadState",
			"uploads": "ybSAsa_uploads"
		};
		//#endregion
		//#region lib/types/client/CompareDialog.js
		/**
		* The compare dialog: two files side by side, rendered as the change between
		* them, and the two paths the comparison is between.
		*
		* Each side is read as one bounded page; a side the Host cut leaves the reader
		* with a note rather than a silently partial answer. The diff itself is the
		* shared `DiffBlock`, so a comparison here reads exactly like every other
		* change surface.
		*/
		/**
		* Render the comparison.
		* @param props - see {@link CompareDialogProps}.
		* @returns the dialog element.
		*/
		function CompareDialog({ base, target, t, readPage, onClose }) {
			const [pages, setPages] = (0, react.useState)(null);
			const [failure, setFailure] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let basePage;
				let targetPage;
				const settle = () => {
					if (basePage !== void 0 && targetPage !== void 0) setPages({
						base: basePage,
						target: targetPage
					});
				};
				setPages(null);
				setFailure(null);
				readPage(base).then((result) => {
					if (!result.ok) {
						setFailure(result.error);
						return;
					}
					basePage = result.value;
					settle();
				});
				readPage(target).then((result) => {
					if (!result.ok) {
						setFailure(result.error);
						return;
					}
					targetPage = result.value;
					settle();
				});
			}, [
				base,
				target,
				readPage
			]);
			const labels = {
				copy: t("diff.copy"),
				copied: t("diff.copied"),
				collapse: t("diff.collapse"),
				expand: (hidden) => t("diff.expand", { hidden }),
				collapseAria: t("diff.collapseAria"),
				expandAria: (hidden) => t("diff.expandAria", { hidden }),
				files: (count) => t("diff.files", { count })
			};
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				title: t("compare.title"),
				closeLabel: t("dialog.close"),
				onClose,
				className: FilesBody_module_css_default.compareDialog ?? "",
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: FilesBody_module_css_default.comparePaths,
						"data-compare-paths": true,
						children: t("compare.paths", {
							base,
							target
						})
					}),
					failure !== null && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogError,
						role: "alert",
						"data-compare-failure": true,
						children: actionFailureLine(t, failure)
					}),
					failure === null && pages === null && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogNote,
						"data-compare-loading": true,
						children: t("loading")
					}),
					pages !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(!pages.base.eof || !pages.target.eof) && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogNote,
						"data-compare-truncated": true,
						children: t("compare.truncated")
					}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DiffBlock, {
						diffs: [{
							path: target,
							oldText: pages.base.text,
							newText: pages.target.text
						}],
						labels
					})] })
				]
			});
		}
		//#endregion
		//#region lib/types/client/DeleteDialog.js
		/**
		* The delete dialog: one confirmation naming what goes, then the removal.
		*
		* Deletion is refused nowhere else: the reader confirmed it, and the Host is
		* the only party that knows whether the entry can go. A selection of several
		* entries is named by its count rather than by every basename. A failure the
		* Host reports stays in the dialog, which keeps its confirm button so the reader
		* can try again.
		*/
		/**
		* Render the delete confirmation.
		* @param props - see {@link DeleteDialogProps}.
		* @returns the dialog element.
		*/
		function DeleteDialog({ names, t, onConfirm, onClose }) {
			const only = names.length === 1 ? names[0] : void 0;
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(null);
			const confirm = () => {
				setBusy(true);
				setFailure(null);
				onConfirm().then((line) => {
					setBusy(false);
					if (line === null) onClose();
					else setFailure(line);
				});
			};
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				title: t("delete.title"),
				description: only === void 0 ? t("delete.descriptionMany", { count: String(names.length) }) : t("delete.description", { name: only }),
				closeLabel: t("dialog.close"),
				onClose,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: onClose,
					children: t("dialog.cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					className: FilesBody_module_css_default.dangerButton,
					"data-delete-confirm": true,
					disabled: busy,
					onClick: confirm,
					children: t("delete.confirm")
				})] }),
				children: failure !== null && (0, react_jsx_runtime.jsx)("p", {
					className: FilesBody_module_css_default.dialogError,
					role: "alert",
					"data-delete-failure": true,
					children: failure
				})
			});
		}
		//#endregion
		//#region lib/types/client/EntryMenu.js
		/**
		* The row menu: what can be done to the entries a right-click landed on, opened
		* where the pointer was.
		*
		* A context menu has no trigger of its own, so the list is placed from a
		* zero-size rect at the pointer instead of from an anchor element, and it
		* portals out of the tree so no scrolling ancestor can crop it.
		*
		* The menu acts on a selection, not always on one row: the row the pointer was
		* over is part of the tab's selection and the selection is bigger, so the whole
		* selection is what the entry-wide rows — copy, download, move, delete — name
		* and count. The rows that only make sense for one entry (open, compare,
		* timeline, rename) are offered for exactly one, and are absent rather than
		* disabled otherwise. A directory has nothing to open, compare, download, or
		* read a timeline of, so those rows are absent too — except `open`, which stays
		* visible and disabled so the menu's rows keep one order.
		*/
		/**
		* Render one entry's context menu, placed at the pointer that opened it.
		* @param props - see {@link EntryMenuProps}.
		* @returns the portaled menu list.
		*/
		function EntryMenu({ target, selection, compareBase, t, onSelect, onClose }) {
			const single = selection.length === 1 ? selection[0] : void 0;
			const files = selection.filter((entry) => entry.kind === "file");
			const items = [{
				id: "open",
				label: t("menu.open"),
				disabled: single?.kind !== "file"
			}];
			if (single?.kind === "file") {
				items.push({
					id: "compareSelect",
					label: t("menu.compareSelect")
				});
				if (compareBase !== null && compareBase !== single.path) items.push({
					id: "compareWith",
					label: t("menu.compareWith")
				});
				items.push({
					id: "timeline",
					label: t("menu.timeline")
				});
			}
			const count = String(selection.length);
			const many = selection.length > 1;
			items.push({
				type: "separator",
				id: "separator-entries"
			});
			items.push({
				id: "copyPath",
				label: t("menu.copyPath")
			});
			items.push({
				id: "copyRelativePath",
				label: t("menu.copyRelativePath")
			});
			if (files.length > 0) items.push({
				id: "download",
				label: files.length === 1 ? t("menu.download") : t("menu.downloadMany", { count: String(files.length) })
			});
			items.push({
				id: "move",
				label: many ? t("menu.moveMany", { count }) : t("menu.move")
			});
			items.push({
				type: "separator",
				id: "separator-destructive"
			});
			if (single !== void 0) items.push({
				id: "rename",
				label: t("menu.rename")
			});
			items.push({
				id: "delete",
				label: many ? t("menu.deleteMany", { count }) : t("menu.delete"),
				danger: true
			});
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open: true,
				autoFocus: true,
				anchor: null,
				items,
				onSelect: (id) => {
					onSelect(id);
				},
				onClose,
				portal: true,
				getAnchorRect: (0, react.useCallback)(() => new DOMRect(target.x, target.y, 0, 0), [target.x, target.y])
			});
		}
		//#endregion
		//#region lib/types/client/MoveDialog.js
		/**
		* The move dialog: one destination directory for the entries the reader
		* selected, validated before the Host is asked.
		*
		* The destination is typed in the same vocabulary as the address bar — absolute
		* anywhere the Host can reach, or relative to this session's workspace root —
		* so the dialog says nothing the tree does not already teach. A blank one is
		* refused here, because an empty path is a keystroke rather than a destination;
		* everything else is the Host's to answer, and its refusal stays in the dialog
		* with the typed destination still there to correct.
		*/
		/**
		* Render the move dialog.
		* @param props - see {@link MoveDialogProps}.
		* @returns the dialog element.
		*/
		function MoveDialog({ names, destination, t, onConfirm, onClose }) {
			const [draft, setDraft] = (0, react.useState)(destination);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(null);
			const inputRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				inputRef.current?.select();
			}, []);
			const confirm = () => {
				setBusy(true);
				setFailure(null);
				onConfirm(draft).then((line) => {
					setBusy(false);
					if (line === null) onClose();
					else setFailure(line);
				});
			};
			const invalid = draft.trim() === "";
			const only = names.length === 1 ? names[0] : void 0;
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				title: t("move.title"),
				description: only === void 0 ? t("move.descriptionMany", { count: String(names.length) }) : t("move.description", { name: only }),
				closeLabel: t("dialog.close"),
				onClose,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: onClose,
					children: t("dialog.cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					"data-move-confirm": true,
					disabled: busy || invalid,
					onClick: confirm,
					children: t("move.confirm")
				})] }),
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						ref: inputRef,
						className: FilesBody_module_css_default.dialogInput,
						"data-move-input": true,
						"aria-label": t("move.input"),
						value: draft,
						onChange: (event) => {
							setDraft(event.target.value);
						}
					}),
					invalid && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogError,
						role: "alert",
						"data-move-invalid": true,
						children: t("move.invalid")
					}),
					failure !== null && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogError,
						role: "alert",
						"data-move-failure": true,
						children: failure
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/icons.js
		/** An arrow leaving a tray: a file is going out to the tree. */
		const IconUploadOutline16 = ({ size = 16, className }) => (0, react_jsx_runtime.jsx)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 24 24",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: (0, react_jsx_runtime.jsx)("path", {
				d: "M11 4H13V11H16L12 15.5L8 11H11V4ZM4 17H6V19H18V17H20V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V17Z",
				fill: "currentColor"
			})
		});
		//#endregion
		//#region lib/types/client/PathHeader.js
		/**
		* The tree's header row: where this tab is rooted, and the places it can jump
		* to.
		*
		* The path is the address, so it is editable in place: clicking it swaps in a
		* text field seeded with the tab's own root, Enter lists the typed address,
		* Escape and blur put the display back. The folder button at the row's start
		* opens the location menu — every Workspace the Client knows, the session's
		* working directory, the Host account's home, and whatever this tab has visited
		* — the upload button beside it puts files from the reader's machine into the
		* directory the tab is rooted at, and the reload button at its end lists the
		* expanded levels again.
		*/
		/**
		* Resolve a typed address to the path the tree should list.
		*
		* A `~` (alone, or followed by a separator) stands for the Host account's home;
		* every other address is taken as written, with surrounding whitespace
		* dropped. An unknown home leaves the address untouched, so the listing reports
		* it as a path that cannot be read rather than guessing one.
		* @param address - what the reader typed.
		* @param home - the Host account's home directory, when known.
		* @returns the absolute (or workspace-relative) path to list.
		*/
		function expandAddress(address, home) {
			const trimmed = address.trim();
			if (!/^~([/\\]|$)/.test(trimmed)) return trimmed;
			if (home === void 0) return trimmed;
			const rest = trimmed.slice(1).replace(/^[/\\]+/, "");
			return rest === "" ? home : `${home.replace(/[/\\]+$/, "")}/${rest}`;
		}
		/**
		* Keep the path row's `data-files-path-clipped` current: set while the path's
		* text is wider than its box, so the stylesheet fades the clipped start. Read
		* after each commit that can change the path or mount the header, and whenever
		* either box resizes; written to the DOM directly because it changes only how
		* the stylesheet fades what is already rendered.
		*/
		function usePathClipped(box, text, path, editing) {
			(0, react.useLayoutEffect)(() => {
				const outer = box.current;
				const inner = text.current;
				if (outer === null || inner === null) return void 0;
				const apply = () => {
					if (inner.offsetWidth > outer.clientWidth) outer.dataset.filesPathClipped = "";
					else delete outer.dataset.filesPathClipped;
				};
				apply();
				const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(apply);
				observer?.observe(outer);
				observer?.observe(inner);
				return () => {
					observer?.disconnect();
				};
			}, [
				box,
				text,
				path,
				editing
			]);
		}
		/**
		* Render the header row.
		* @param props - see {@link PathHeaderProps}.
		* @returns the row's path, its location button, and its reload button.
		*/
		function PathHeader({ root, cwd, workspaces, recent, home, t, onNavigate, onReload, onUpload }) {
			const pathRef = (0, react.useRef)(null);
			const pathTextRef = (0, react.useRef)(null);
			const inputRef = (0, react.useRef)(null);
			const locationRef = (0, react.useRef)(null);
			const uploadRef = (0, react.useRef)(null);
			const [editing, setEditing] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)("");
			const [locationsOpen, setLocationsOpen] = (0, react.useState)(false);
			usePathClipped(pathRef, pathTextRef, root, editing);
			(0, react.useLayoutEffect)(() => {
				if (editing) inputRef.current?.select();
			}, [editing]);
			const cancel = () => {
				setEditing(false);
			};
			const commit = () => {
				setEditing(false);
				const next = expandAddress(draft, home);
				if (next === "" || next === root) return;
				onNavigate(next);
			};
			const targets = /* @__PURE__ */ new Map();
			const items = [];
			const add = (id, path, label, disabled = false) => {
				targets.set(id, path);
				items.push({
					id,
					label,
					disabled
				});
			};
			if (workspaces.length > 0) {
				items.push({
					type: "label",
					id: "locations.workspaces",
					text: t("locations.workspaces")
				});
				for (const workspace of workspaces) add(`workspace:${workspace.id}`, workspace.path, workspace.title);
				items.push({
					type: "separator",
					id: "locations.separator"
				});
			}
			items.push({
				type: "label",
				id: "locations.other",
				text: t("locations.other")
			});
			add("cwd", cwd, locationLabel(t("locations.cwd"), cwd));
			add("home", home ?? "", locationLabel(t("locations.home"), home ?? ""), home === void 0);
			if (recent.length > 0) {
				items.push({
					type: "label",
					id: "locations.recent",
					text: t("locations.recent")
				});
				for (const path of recent) add(`recent:${path}`, path, path);
			}
			const select = (id) => {
				setLocationsOpen(false);
				const target = targets.get(id);
				/* v8 ignore next -- the menu emits only the ids minted above; an unknown id has no target. */
				if (target !== void 0) onNavigate(target);
			};
			const getAnchorRect = (0, react.useCallback)(() => locationRef.current?.getBoundingClientRect() ?? null, []);
			const { directory, name } = pathPartsOf(root);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: FilesBody_module_css_default.header,
				children: [
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
						open: locationsOpen,
						autoFocus: true,
						anchor: (0, react_jsx_runtime.jsx)("button", {
							ref: locationRef,
							type: "button",
							className: FilesBody_module_css_default.tool,
							"aria-label": t("locations"),
							title: t("locations"),
							"aria-haspopup": "menu",
							"aria-expanded": locationsOpen,
							"data-files-locations": true,
							onClick: () => {
								setLocationsOpen((open) => !open);
							},
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16, {})
						}),
						items,
						onSelect: select,
						onClose: () => {
							setLocationsOpen(false);
						},
						portal: true,
						getAnchorRect
					}),
					editing ? (0, react_jsx_runtime.jsx)("input", {
						ref: inputRef,
						className: FilesBody_module_css_default.pathInput,
						"data-files-path-edit": true,
						"aria-label": t("path.input"),
						value: draft,
						onChange: (event) => {
							setDraft(event.target.value);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") commit();
							else if (event.key === "Escape") cancel();
						},
						onBlur: cancel
					}) : (0, react_jsx_runtime.jsx)("button", {
						ref: pathRef,
						type: "button",
						className: FilesBody_module_css_default.path,
						title: root,
						"data-files-path": true,
						onClick: () => {
							setDraft(root);
							setEditing(true);
						},
						children: (0, react_jsx_runtime.jsxs)("span", {
							ref: pathTextRef,
							className: FilesBody_module_css_default.pathText,
							children: [directory !== "" && (0, react_jsx_runtime.jsx)("span", {
								className: FilesBody_module_css_default.pathDirectory,
								children: directory
							}), (0, react_jsx_runtime.jsx)("span", {
								className: FilesBody_module_css_default.pathName,
								children: name
							})]
						})
					}),
					(0, react_jsx_runtime.jsx)("input", {
						ref: uploadRef,
						type: "file",
						multiple: true,
						hidden: true,
						"data-files-upload-input": true,
						onChange: (event) => {
							onUpload(event.target.files);
							event.target.value = "";
						}
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: FilesBody_module_css_default.tool,
						"aria-label": t("upload"),
						title: t("upload"),
						"data-files-upload": true,
						onClick: () => {
							uploadRef.current?.click();
						},
						children: (0, react_jsx_runtime.jsx)(IconUploadOutline16, {})
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: FilesBody_module_css_default.tool,
						"aria-label": t("reload"),
						title: t("reload"),
						"data-files-reload": true,
						onClick: onReload,
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {})
					})
				]
			});
		}
		/** One location row: what the place is, then the directory it names. */
		function locationLabel(name, path) {
			return (0, react_jsx_runtime.jsxs)("span", {
				className: FilesBody_module_css_default.locationLabel,
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: FilesBody_module_css_default.locationName,
					children: name
				}), (0, react_jsx_runtime.jsx)("span", {
					className: FilesBody_module_css_default.locationPath,
					children: path
				})]
			});
		}
		//#endregion
		//#region lib/types/client/RenameDialog.js
		/**
		* The rename dialog: one entry's new name, validated before the Host is asked.
		*
		* The name is one path segment, so a blank name and one carrying a separator
		* are refused here — the Host would refuse them too, and telling the reader
		* before the round trip is the difference between a validation and an error.
		* Until the name differs from the current one, confirming would be a no-op, so
		* the confirm button stays disabled. A failure the Host does report stays in
		* the dialog, with the name the reader typed still there to correct.
		*/
		/** Whether one typed name is a usable single path segment. */
		function validEntryName(name) {
			return name.trim() !== "" && !/[/\\]/.test(name);
		}
		/**
		* Render the rename dialog.
		* @param props - see {@link RenameDialogProps}.
		* @returns the dialog element.
		*/
		function RenameDialog({ name, t, onConfirm, onClose }) {
			const [draft, setDraft] = (0, react.useState)(name);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(null);
			const inputRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				inputRef.current?.select();
			}, []);
			const confirm = () => {
				setBusy(true);
				setFailure(null);
				onConfirm(draft).then((line) => {
					setBusy(false);
					if (line === null) onClose();
					else setFailure(line);
				});
			};
			const invalid = !validEntryName(draft);
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				title: t("rename.title"),
				closeLabel: t("dialog.close"),
				onClose,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: onClose,
					children: t("dialog.cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					"data-rename-confirm": true,
					disabled: busy || invalid || draft === name,
					onClick: confirm,
					children: t("rename.confirm")
				})] }),
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						ref: inputRef,
						className: FilesBody_module_css_default.dialogInput,
						"data-rename-input": true,
						"aria-label": t("rename.input"),
						value: draft,
						onChange: (event) => {
							setDraft(event.target.value);
						}
					}),
					invalid && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogError,
						role: "alert",
						"data-rename-invalid": true,
						children: t("rename.invalid")
					}),
					failure !== null && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogError,
						role: "alert",
						"data-rename-failure": true,
						children: failure
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/TimelineDialog.js
		/**
		* The timeline dialog: one file's commits, newest first.
		*
		* A file outside a repository, one never committed, or a Host without git all
		* answer with no commits, and that is what the empty line says. A date is drawn
		* through the dictionary's own template rather than `toLocaleString`: the
		* browser's language is not the app's, and a switch would otherwise leave the
		* two mixed in one row.
		*/
		/** One commit's author date, through the dictionary's date template. */
		function dateLabel(date, t) {
			const at = new Date(Date.parse(date));
			const pad = (value) => String(value).padStart(2, "0");
			return t("timeline.date", {
				y: at.getFullYear(),
				m: pad(at.getMonth() + 1),
				d: pad(at.getDate()),
				h: pad(at.getHours()),
				mi: pad(at.getMinutes())
			});
		}
		/**
		* Render one file's commit history.
		* @param props - see {@link TimelineDialogProps}.
		* @returns the dialog element.
		*/
		function TimelineDialog({ path, t, loadHistory, onClose }) {
			const [history, setHistory] = (0, react.useState)(null);
			const [failure, setFailure] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				setHistory(null);
				setFailure(null);
				loadHistory(path).then((result) => {
					if (result.ok) setHistory(result.value);
					else setFailure(result.error);
				});
			}, [path, loadHistory]);
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				title: t("timeline.title"),
				closeLabel: t("dialog.close"),
				onClose,
				className: FilesBody_module_css_default.timelineDialog ?? "",
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: FilesBody_module_css_default.timelinePath,
						"data-timeline-path": true,
						children: path
					}),
					failure !== null && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogError,
						role: "alert",
						"data-timeline-failure": true,
						children: actionFailureLine(t, failure)
					}),
					failure === null && history === null && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogNote,
						"data-timeline-loading": true,
						children: t("loading")
					}),
					history !== null && history.entries.length === 0 && (0, react_jsx_runtime.jsx)("p", {
						className: FilesBody_module_css_default.dialogNote,
						"data-timeline-empty": true,
						children: t("timeline.empty")
					}),
					history !== null && history.entries.length > 0 && (0, react_jsx_runtime.jsx)("ul", {
						className: FilesBody_module_css_default.timelineList,
						children: history.entries.map((entry) => (0, react_jsx_runtime.jsxs)("li", {
							className: FilesBody_module_css_default.timelineRow,
							"data-timeline-entry": entry.shortHash,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: FilesBody_module_css_default.timelineHash,
									children: entry.shortHash
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: FilesBody_module_css_default.timelineSubject,
									children: entry.subject
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: FilesBody_module_css_default.timelineMeta,
									children: t("timeline.meta", {
										author: entry.author,
										date: dateLabel(entry.date, t)
									})
								}),
								entry.additions + entry.deletions > 0 && (0, react_jsx_runtime.jsx)("span", {
									className: FilesBody_module_css_default.timelineCounts,
									"data-timeline-counts": true,
									children: t("timeline.counts", {
										additions: entry.additions,
										deletions: entry.deletions
									})
								})
							]
						}, entry.hash))
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/FilesBody.js
		/**
		* The file tree's body: the directory it is rooted at, listed one level at a
		* time, and every gesture a row offers.
		*
		* Everything the tree keeps lives in its store, keyed by tab; everything it
		* asks for goes through its injected face. The component itself only decides
		* what to draw for each absolute path and what a gesture means: a plain click
		* selects a row and activates it — a directory toggles, a file opens through the
		* owner's `tabActions` for a `file:` viewer to claim — while a Ctrl/Cmd click
		* adds or removes one row and a Shift click extends the selection from its
		* anchor. Anything that is neither a file nor a directory is shown but refuses
		* both. A right-click opens the row menu on the selection, whose rows copy,
		* download, move, rename, remove, compare, or open a file's timeline. The header
		* row is the address bar (`PathHeader`), the upload control, and the reload
		* control, which drops every listed level and asks again for the expanded ones.
		*
		* Files from the reader's own machine arrive two ways: the header's control
		* picks them, and a drop on the tree carries them. Both name a directory — the
		* tab's root for the header and the body's own background, the row's own
		* directory for a drop on a directory row — and both run through the same
		* gesture below, which keeps one row per file until the Host answers.
		*
		* A drop on a directory can also carry the tree's own rows: dragging a selected
		* row onto a directory row moves the dragged entries there, which is the same
		* `move` the dialog performs. The two gestures are told apart by the drag's own
		* private type, so an OS file drop and a tree drag share every target.
		*/
		/**
		* Closed-union backstop for the row menu's action ids.
		* @param value - the action the menu reported.
		* @returns never; the call is unreachable.
		*/
		/* v8 ignore next 3 -- closed-union backstop; only reached if an action id is forged */
		function assertNever(value) {
			throw new Error(`ui-sidebar-files: unknown row action ${String(value)}`);
		}
		/**
		* The drag-and-drop handlers that make one element the drop target for one
		* directory. A directory's row carries them, so its whole subtree — the row and
		* every level under it — lands files in that directory, and the innermost
		* directory under the pointer is the one that wins. The drop carries either the
		* reader's own files or this tree's dragged rows, which the payload tells apart.
		* @param dir - absolute path of the directory a drop here lands in.
		* @param tree - the level's shared context.
		* @returns the three handlers to spread onto the element.
		*/
		function dropHandlers(dir, tree) {
			return {
				onDragOver: (event) => {
					event.preventDefault();
					event.stopPropagation();
					event.dataTransfer.dropEffect = event.dataTransfer.types.includes("application/x-dsh-workspace-files+json") ? "move" : "copy";
					tree.onDropTarget(dir);
				},
				onDragLeave: () => {
					tree.onDropTarget(null);
				},
				onDrop: (event) => {
					event.preventDefault();
					event.stopPropagation();
					tree.onDropTarget(null);
					const dragged = decodeDragPaths(event.dataTransfer.getData(FILES_DRAG_MIME));
					if (dragged.length > 0) {
						tree.onDropPaths(dir, dragged);
						return;
					}
					tree.onDropFiles(dir, event.dataTransfer.files);
				}
			};
		}
		/** One entry's row, and its children when it is an expanded directory. */
		function Entry({ parent, entry, tree }) {
			const path = childPath(parent, entry.name);
			const selected = tree.state.selected.includes(path);
			/**
			* Open this row's menu where the pointer was: the browser's own menu would
			* otherwise cover the tree.
			* @param event - the context-menu gesture on this row.
			*/
			const openMenu = (event, kind) => {
				event.preventDefault();
				tree.onContextMenu({
					path,
					name: entry.name,
					kind,
					x: event.clientX,
					y: event.clientY
				});
			};
			if (entry.type === "directory") {
				const expanded = tree.state.expanded.includes(path);
				return (0, react_jsx_runtime.jsxs)("li", {
					className: clsx(FilesBody_module_css_default.item, tree.dropDir === path && FilesBody_module_css_default.dropTarget),
					"data-files-entry": "directory",
					"data-files-path": path,
					...tree.dropDir === path ? { "data-files-drop-target": "" } : {},
					...dropHandlers(path, tree),
					children: [(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: clsx(FilesBody_module_css_default.row, selected && FilesBody_module_css_default.rowSelected),
						"aria-expanded": expanded,
						draggable: true,
						"data-files-selected": selected ? "true" : "false",
						onClick: (event) => {
							tree.onActivate(path, "directory", event);
						},
						onContextMenu: (event) => {
							openMenu(event, "directory");
						},
						onDragStart: (event) => {
							tree.onDragStart(event, path);
						},
						children: [expanded ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { className: FilesBody_module_css_default.icon }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { className: FilesBody_module_css_default.icon }), (0, react_jsx_runtime.jsx)("span", {
							className: FilesBody_module_css_default.name,
							children: entry.name
						})]
					}), expanded && (0, react_jsx_runtime.jsx)("ul", {
						className: FilesBody_module_css_default.level,
						children: (0, react_jsx_runtime.jsx)(Level, {
							path,
							tree
						})
					})]
				});
			}
			if (entry.type === "file") return (0, react_jsx_runtime.jsx)("li", {
				className: FilesBody_module_css_default.item,
				"data-files-entry": "file",
				"data-files-path": path,
				children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: clsx(FilesBody_module_css_default.row, selected && FilesBody_module_css_default.rowSelected),
					draggable: true,
					"data-files-selected": selected ? "true" : "false",
					onClick: (event) => {
						tree.onActivate(path, "file", event);
					},
					onContextMenu: (event) => {
						openMenu(event, "file");
					},
					onDragStart: (event) => {
						tree.onDragStart(event, path);
					},
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
						kind: (0, _deepseek_ai_dsh_client_ui_primitives.classifyFileType)(entry.name),
						size: 16,
						className: FilesBody_module_css_default.fileIcon
					}), (0, react_jsx_runtime.jsx)("span", {
						className: FilesBody_module_css_default.name,
						children: entry.name
					})]
				})
			});
			return (0, react_jsx_runtime.jsx)("li", {
				className: FilesBody_module_css_default.item,
				"data-files-entry": "other",
				"data-files-path": path,
				children: (0, react_jsx_runtime.jsx)("span", {
					className: clsx(FilesBody_module_css_default.row, FilesBody_module_css_default.other),
					"aria-disabled": "true",
					title: tree.t("entry.other"),
					children: (0, react_jsx_runtime.jsx)("span", {
						className: FilesBody_module_css_default.name,
						children: entry.name
					})
				})
			});
		}
		/** One directory's rows: its state while listing, its entries once listed. */
		function Level({ path, tree }) {
			const { state, t } = tree;
			const level = state.levels[path];
			if (level === void 0 || level.kind === "loading") return (0, react_jsx_runtime.jsx)("li", {
				className: FilesBody_module_css_default.note,
				"data-files-row": "loading",
				children: t("loading")
			});
			if (level.kind === "failed") return (0, react_jsx_runtime.jsx)("li", {
				className: FilesBody_module_css_default.note,
				"data-files-row": "failed",
				"data-files-code": level.failure.code,
				children: failureLine(t, level.failure)
			});
			const entries = orderEntries(level.level.entries);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				entries.length === 0 && (0, react_jsx_runtime.jsx)("li", {
					className: FilesBody_module_css_default.note,
					"data-files-row": "empty",
					children: t("empty")
				}),
				entries.map((entry) => (0, react_jsx_runtime.jsx)(Entry, {
					parent: path,
					entry,
					tree
				}, entry.name)),
				level.level.truncated && (0, react_jsx_runtime.jsx)("li", {
					className: FilesBody_module_css_default.note,
					"data-files-row": "truncated",
					children: t("truncated")
				})
			] });
		}
		/** The file tree's body: the directory it is rooted at and whatever the reader has opened under it. */
		function FilesBody({ useTabInfo, sessionId, useSessions, useWorkspaces, useStore, actions, start, navigate, load, toggle, rename, remove, move, upload, download, readPage, history, homePath, t }) {
			const { tab } = useTabInfo();
			const { signal, actions: tabActions } = tab;
			const cwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd);
			const workspaces = useWorkspaces((state) => state.items);
			const locations = (0, react.useMemo)(() => workspaces.map((workspace) => ({
				id: workspace.workspaceId,
				title: workspace.title,
				path: workspace.path
			})), [workspaces]);
			const state = useStore((store) => store.byTab[tab.id]);
			const order = (0, react.useMemo)(() => state === void 0 ? [] : visiblePaths(state), [state]);
			const bodyRef = (0, react.useRef)(null);
			const scrollTopRef = (0, react.useRef)(0);
			const rootSeen = (0, react.useRef)(state?.root);
			const [menuAt, setMenuAt] = (0, react.useState)(null);
			const [dialog, setDialog] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [dropDir, setDropDir] = (0, react.useState)(null);
			const readPageBound = (0, react.useCallback)((path) => readPage(path, signal), [readPage, signal]);
			const historyBound = (0, react.useCallback)((path) => history(path, signal), [history, signal]);
			const seeded = state !== void 0;
			(0, react.useLayoutEffect)(() => {
				const body = bodyRef.current;
				if (seeded && body !== null) {
					body.scrollTop = state.scrollTop;
					scrollTopRef.current = body.scrollTop;
				}
			}, [seeded]);
			(0, react.useLayoutEffect)(() => {
				if (rootSeen.current === state?.root) return;
				rootSeen.current = state?.root;
				scrollTopRef.current = 0;
				/* v8 ignore next -- the body is mounted whenever the root under it changes */
				if (bodyRef.current !== null) bodyRef.current.scrollTop = 0;
			}, [state?.root]);
			(0, react.useEffect)(() => () => {
				if (seeded && !signal.aborted) actions.scrolled(tab.id, scrollTopRef.current);
			}, [
				seeded,
				signal,
				tab.id,
				actions
			]);
			(0, react.useEffect)(() => {
				if (state !== void 0 || cwd === void 0 || signal.aborted) return;
				start(tab.id, cwd, signal);
			}, [
				state,
				cwd,
				tab.id,
				signal,
				start
			]);
			if (cwd === void 0) return (0, react_jsx_runtime.jsx)("div", {
				className: FilesBody_module_css_default.status,
				"data-files-state": "no-workspace",
				children: (0, react_jsx_runtime.jsx)("p", {
					className: FilesBody_module_css_default.statusLine,
					children: t("noWorkspace")
				})
			});
			if (state === void 0) return null;
			/**
			* Download the files of one selection, one request each, and report the ones
			* that could not start.
			*
			* A page served by the Host hands the browser the Host's streaming route, so
			* nothing here holds a file. A `file://` shell has no such route: it reads each
			* file through the Remote face, which is capped at the Host's complete-file
			* limit but is the only path it has.
			* @param targets - the entries the gesture acts on; directories are skipped.
			*/
			const startDownload = (targets) => {
				const files = targets.filter((target) => target.kind === "file").map((target) => ({
					path: target.path,
					name: target.name
				}));
				/* v8 ignore next -- the menu offers download only while the selection holds a file */
				if (files.length === 0) return;
				if (httpDownloadsAvailable()) {
					downloadFiles(files, sessionId, signal).then((report) => {
						reportFailures(report.failures);
					});
					return;
				}
				downloadThroughRemote(files).then(reportFailures);
			};
			/** One line naming the first files that could not start, when any did not. */
			const reportFailures = (failures) => {
				if (signal.aborted || failures.length === 0) return;
				setNotice(t("download.failed", {
					count: String(failures.length),
					message: failures[0] ?? ""
				}));
			};
			/**
			* Read one whole file per request through the Remote face and hand each to the
			* browser, reporting the files the Host refused.
			* @param files - the files the gesture selected, in the order to download them.
			* @returns one `name: reason` line per file that could not start.
			*/
			const downloadThroughRemote = async (files) => {
				const failures = [];
				for (const file of files) {
					if (signal.aborted) break;
					const result = await download(file.path, signal);
					if (signal.aborted) break;
					if (!result.ok) {
						failures.push(`${file.name}: ${actionFailureLine(t, result.error)}`);
						continue;
					}
					saveBase64File(result.value.name, result.value.base64);
				}
				return failures;
			};
			/**
			* Rename one entry, then list the directory that showed it again. An expanded
			* renamed directory has its own level listed under its new path.
			* @param target - the entry being renamed.
			* @param newName - the name the reader confirmed.
			* @returns a localized failure line, or null when the Host accepted it.
			*/
			const confirmRename = (target, newName) => rename(target.path, newName, signal).then((result) => {
				if (!result.ok) return actionFailureLine(t, result.error);
				load(tab.id, parentPath(target.path), signal);
				if (state.expanded.includes(target.path)) load(tab.id, result.value.absolutePath, signal);
				return null;
			});
			/**
			* Move entries into one directory, then list every directory that changed: the
			* ones they left, and the one they landed in — whose absolute path only the
			* Host knows, since the reader may have typed a relative destination.
			* @param paths - absolute paths of the entries to move.
			* @param destination - the destination the reader confirmed or dropped on.
			* @returns a localized failure line, or null when the Host accepted it.
			*/
			const applyMove = (paths, destination) => move(paths, destination, signal).then((result) => {
				if (signal.aborted) return null;
				const directories = new Set(paths.map(parentPath));
				if (result.ok) {
					directories.add(result.value.destination);
					actions.clearSelection(tab.id);
				}
				for (const directory of directories) load(tab.id, directory, signal);
				return result.ok ? null : actionFailureLine(t, result.error);
			});
			/**
			* Move the rows one drop carried into the directory it landed on. Entries
			* already there, and ones inside another dragged directory, are dropped before
			* the Host is asked, so a gesture that could do nothing sends no request.
			* @param paths - absolute paths the drag carried.
			* @param dir - absolute path of the directory it was dropped on.
			*/
			const dropMove = (paths, dir) => {
				const movable = movablePaths(paths, dir);
				if (movable.length === 0) return;
				applyMove(movable, dir).then((line) => {
					if (line !== null) setNotice(line);
				});
			};
			/**
			* Remove the entries of one selection, one request each, then list every
			* directory that lost one. The dialog stays open on the first refusal so the
			* reader can read it; entries removed before it are already gone from the
			* listing behind it.
			* @param targets - the entries being removed.
			* @returns a localized failure line, or null when every removal was accepted.
			*/
			const confirmDelete = async (targets) => {
				let failure = null;
				const directories = /* @__PURE__ */ new Set();
				for (const target of targets) {
					const result = await remove(target.path, signal);
					if (signal.aborted) return failure;
					if (!result.ok) {
						failure ??= actionFailureLine(t, result.error);
						continue;
					}
					directories.add(parentPath(target.path));
				}
				for (const directory of directories) load(tab.id, directory, signal);
				if (directories.size > 0) actions.clearSelection(tab.id);
				return failure;
			};
			/**
			* Perform one row menu's action.
			* @param action - the row the reader chose.
			* @param target - the entry the menu was opened on.
			*/
			const runMenuAction = (action, target) => {
				setMenuAt(null);
				setNotice(null);
				const targets = menuTargets(state, target);
				switch (action) {
					case "open":
						tabActions.openResource(fileAddressFor(sessionId, state.root, target.path));
						return;
					case "compareSelect":
						actions.compareSelected(tab.id, target.path);
						return;
					case "compareWith":
						setDialog({
							action: "compare",
							target,
							base: state.compareBase
						});
						return;
					case "timeline":
						setDialog({
							action: "timeline",
							target
						});
						return;
					case "copyPath":
						(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(targets.map((entry) => entry.path).join("\n"));
						return;
					case "copyRelativePath":
						(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(targets.map((entry) => relativeToRoot(state.root, entry.path)).join("\n"));
						return;
					case "download":
						startDownload(targets);
						return;
					case "move":
						setDialog({
							action: "move",
							targets
						});
						return;
					case "rename":
						setDialog({
							action: "rename",
							target
						});
						return;
					case "delete":
						setDialog({
							action: "delete",
							targets
						});
						return;
					/* v8 ignore next -- closed-union backstop; only reached if an action id is forged */
					default: return assertNever(action);
				}
			};
			/**
			* Put the files the reader picked or dropped into one directory.
			*
			* Each file gets a row on the tab's upload list before it is read, keeps that
			* row carrying the reason if the Host refuses it, and leaves it on the way
			* into a directory that is listed again. The directory opens first when it
			* was closed, so a landed file is never hidden inside a collapsed level.
			* @param dir - absolute path of the directory the files land in.
			* @param files - what the gesture delivered.
			*/
			const startUpload = (dir, files) => {
				for (const file of filesOf(files)) {
					const path = childPath(dir, file.name);
					actions.uploadQueued(tab.id, {
						path,
						dir,
						name: file.name,
						bytes: file.size
					});
					upload(tab.id, dir, file, signal).then((result) => {
						if (result === void 0) return;
						actions.uploadFinished(tab.id, path, result.ok ? void 0 : result.error);
						if (!result.ok) return;
						actions.expand(tab.id, dir);
						load(tab.id, dir, signal);
					});
				}
			};
			/**
			* Apply one click to the selection, and activate the row when the click was a
			* plain one: a directory toggles, a file opens. The two modified gestures
			* select without activating, so a Ctrl/Cmd click can build a selection of
			* files without opening every one of them.
			* @param path - absolute path of the row clicked.
			* @param kind - whether that row is a file or a directory.
			* @param event - the click, read for its modifier keys.
			*/
			const activate = (path, kind, event) => {
				const gesture = selectionGesture(event);
				if (gesture === "toggle") {
					actions.toggleSelected(tab.id, path);
					return;
				}
				if (gesture === "range") {
					actions.selectRange(tab.id, rangeBetween(order, state.anchor, path));
					return;
				}
				actions.selectOne(tab.id, path);
				if (kind === "directory") toggle(tab.id, path, state.levels[path] !== void 0, signal);
				else tabActions.openResource(fileAddressFor(sessionId, state.root, path));
			};
			/**
			* Start dragging one row, carrying the whole selection it belongs to.
			* @param event - the drag start on that row.
			* @param path - absolute path of the row under the pointer.
			*/
			const startDrag = (event, path) => {
				const dragged = state.selected.includes(path) ? state.selected : [path];
				event.dataTransfer.setData(FILES_DRAG_MIME, encodeDragPaths(dragged));
				event.dataTransfer.effectAllowed = "move";
			};
			const tree = {
				state,
				onActivate: activate,
				onContextMenu: (target) => {
					setNotice(null);
					if (!state.selected.includes(target.path)) actions.selectOne(tab.id, target.path);
					setMenuAt(target);
				},
				onDragStart: startDrag,
				onDropFiles: startUpload,
				onDropPaths: (dir, paths) => {
					dropMove(paths, dir);
				},
				dropDir,
				onDropTarget: setDropDir,
				t
			};
			const reload = () => {
				actions.reset(tab.id);
				for (const path of state.expanded) load(tab.id, path, signal);
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: FilesBody_module_css_default.root,
					"data-files-state": "tree",
					"data-files-root": state.root,
					children: [
						(0, react_jsx_runtime.jsx)(PathHeader, {
							root: state.root,
							cwd,
							workspaces: locations,
							recent: state.recent,
							home: homePath(),
							t,
							onNavigate: (path) => {
								setNotice(null);
								navigate(tab.id, path, signal);
							},
							onReload: reload,
							onUpload: (files) => {
								setNotice(null);
								startUpload(state.root, files);
							}
						}),
						notice !== null && (0, react_jsx_runtime.jsx)("p", {
							className: FilesBody_module_css_default.notice,
							role: "status",
							"data-files-notice": true,
							children: notice
						}),
						state.uploads.length > 0 && (0, react_jsx_runtime.jsx)("ul", {
							className: FilesBody_module_css_default.uploads,
							"data-files-uploads": true,
							children: state.uploads.map((task) => (0, react_jsx_runtime.jsxs)("li", {
								className: FilesBody_module_css_default.upload,
								"data-files-upload-row": task.failure === void 0 ? "sending" : "failed",
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: FilesBody_module_css_default.uploadName,
										title: task.path,
										children: task.name
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: FilesBody_module_css_default.uploadState,
										children: task.failure === void 0 ? t("upload.sending") : uploadFailureLine(t, task.failure)
									}),
									task.failure !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: FilesBody_module_css_default.tool,
										"aria-label": t("upload.dismiss"),
										"data-files-upload-dismiss": true,
										onClick: () => {
											actions.uploadFinished(tab.id, task.path, void 0);
										},
										children: t("upload.dismiss")
									})
								]
							}, task.path))
						}),
						(0, react_jsx_runtime.jsx)("div", {
							ref: bodyRef,
							className: clsx(FilesBody_module_css_default.body, dropDir === state.root && FilesBody_module_css_default.dropTarget),
							"data-files-body": true,
							...dropDir === state.root ? { "data-files-drop-target": "" } : {},
							onScroll: (event) => {
								scrollTopRef.current = event.currentTarget.scrollTop;
							},
							...dropHandlers(state.root, tree),
							children: (0, react_jsx_runtime.jsx)("ul", {
								className: FilesBody_module_css_default.level,
								children: (0, react_jsx_runtime.jsx)(Level, {
									path: state.root,
									tree
								})
							})
						})
					]
				}),
				menuAt !== null && (0, react_jsx_runtime.jsx)(EntryMenu, {
					target: menuAt,
					selection: menuTargets(state, menuAt),
					compareBase: state.compareBase,
					t,
					onSelect: (action) => {
						runMenuAction(action, menuAt);
					},
					onClose: () => {
						setMenuAt(null);
					}
				}),
				dialog?.action === "rename" && (0, react_jsx_runtime.jsx)(RenameDialog, {
					name: dialog.target.name,
					t,
					onConfirm: (newName) => confirmRename(dialog.target, newName),
					onClose: () => {
						setDialog(null);
					}
				}),
				dialog?.action === "delete" && (0, react_jsx_runtime.jsx)(DeleteDialog, {
					names: dialog.targets.map((target) => target.name),
					t,
					onConfirm: () => confirmDelete(dialog.targets),
					onClose: () => {
						setDialog(null);
					}
				}),
				dialog?.action === "move" && (0, react_jsx_runtime.jsx)(MoveDialog, {
					names: dialog.targets.map((target) => target.name),
					destination: state.root,
					t,
					onConfirm: (destination) => applyMove(dialog.targets.map((target) => target.path), destination),
					onClose: () => {
						setDialog(null);
					}
				}),
				dialog?.action === "compare" && (0, react_jsx_runtime.jsx)(CompareDialog, {
					base: dialog.base,
					target: dialog.target.path,
					t,
					readPage: readPageBound,
					onClose: () => {
						setDialog(null);
					}
				}),
				dialog?.action === "timeline" && (0, react_jsx_runtime.jsx)(TimelineDialog, {
					path: dialog.target.path,
					t,
					loadHistory: historyBound,
					onClose: () => {
						setDialog(null);
					}
				})
			] });
		}
		//#endregion
		//#region lib/types/client/FilesTitle.js
		/**
		* The title as the chip and a floating panel's header show it.
		* @param props - the tab information hook.
		* @returns the folder sheet followed by the tab's title text.
		*/
		function FilesTitle({ useTabInfo }) {
			const { tab } = useTabInfo();
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
				kind: "folder",
				size: 16,
				className: FilesBody_module_css_default.titleIcon
			}), tab.title] });
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Simplified Chinese dictionary and key-set source of truth. */
		const zh = {
			"type.label": "文件",
			"guide.title": "工作区文件",
			"guide.description": "浏览会话工作区的文件",
			loading: "正在读取…",
			empty: "空目录",
			truncated: "条目太多，只显示了一部分。",
			noWorkspace: "这个会话没有工作区目录。",
			reload: "重新读取",
			upload: "上传文件",
			"upload.sending": "正在上传…",
			"upload.dismiss": "忽略",
			"upload.exists": "同名文件已存在，没有覆盖",
			"upload.tooLarge": "文件超过上传大小上限",
			"upload.denied": "当前权限不允许写入这个目录",
			"upload.notFile": "这个位置已经有了同名的目录",
			"entry.other": "这不是文件或目录，没法打开。",
			"error.notFound": "这个目录不在了。可能已被移动或删除。",
			"error.outsideWorkspace": "这个目录在工作区之外，侧栏不会读取它。",
			"error.notDirectory": "这不是一个目录。",
			"error.unavailable": "读取失败：{message}",
			"error.tooLarge": "文件太大，无法下载。",
			"error.actionFailed": "操作失败：{message}",
			"error.exists": "目标位置已有同名文件或目录。",
			"download.failed": "有 {count} 个文件没能开始下载：{message}",
			"path.input": "路径",
			"locations": "跳转到其他位置",
			"locations.workspaces": "工作区",
			"locations.other": "其他位置",
			"locations.cwd": "当前目录",
			"locations.home": "主目录",
			"locations.recent": "最近访问",
			"menu.open": "打开",
			"menu.compareSelect": "选择以进行比较",
			"menu.compareWith": "与已选文件进行比较",
			"menu.timeline": "打开时间线",
			"menu.copyPath": "复制路径",
			"menu.copyRelativePath": "复制相对路径",
			"menu.download": "下载",
			"menu.downloadMany": "下载 {count} 个文件",
			"menu.move": "移动到…",
			"menu.moveMany": "移动 {count} 项…",
			"menu.rename": "重命名",
			"menu.delete": "删除",
			"menu.deleteMany": "删除 {count} 项",
			"dialog.cancel": "取消",
			"dialog.close": "关闭",
			"move.title": "移动到",
			"move.description": "把“{name}”移动到：",
			"move.descriptionMany": "把选中的 {count} 项移动到：",
			"move.input": "目标目录",
			"move.confirm": "移动",
			"move.invalid": "请输入目标目录。",
			"rename.title": "重命名",
			"rename.input": "新名称",
			"rename.confirm": "重命名",
			"rename.invalid": "名称不能为空，也不能包含 “/” 或 “\\”。",
			"delete.title": "删除",
			"delete.description": "确定要删除“{name}”吗？这个操作不能撤销。",
			"delete.descriptionMany": "确定要删除这 {count} 项吗？这个操作不能撤销。",
			"delete.confirm": "删除",
			"compare.title": "比较",
			"compare.paths": "{base} ↔ {target}",
			"compare.truncated": "只比较了每个文件的第一页。",
			"timeline.title": "时间线",
			"timeline.empty": "这个文件没有提交历史。",
			"timeline.date": "{y}-{m}-{d} {h}:{mi}",
			"timeline.meta": "{author} · {date}",
			"timeline.counts": "+{additions} −{deletions}",
			"diff.copy": "复制",
			"diff.copied": "已复制",
			"diff.collapse": "收起",
			"diff.expand": "展开 {hidden} 行",
			"diff.collapseAria": "收起隐藏的行",
			"diff.expandAria": "展开 {hidden} 行",
			"diff.files": "{count} 个文件"
		};
		/** English dictionary, checked against the Chinese key set. */
		const en = {
			"type.label": "Files",
			"guide.title": "Workspace files",
			"guide.description": "Browse files in this session's workspace",
			loading: "Reading…",
			empty: "Empty directory",
			truncated: "Too many entries, showing only some of them.",
			noWorkspace: "This session has no workspace directory.",
			reload: "Reload",
			upload: "Upload files",
			"upload.sending": "Uploading…",
			"upload.dismiss": "Dismiss",
			"upload.exists": "A file with that name is already there, so it was not replaced.",
			"upload.tooLarge": "The file is larger than the upload limit.",
			"upload.denied": "Writing into this directory is not permitted here.",
			"upload.notFile": "A directory of that name is already there.",
			"entry.other": "Not a file or a directory, so it cannot be opened.",
			"error.notFound": "That directory is gone. It may have been moved or deleted.",
			"error.outsideWorkspace": "That directory is outside the workspace, so the sidebar will not read it.",
			"error.notDirectory": "That is not a directory.",
			"error.unavailable": "Read failed: {message}",
			"error.tooLarge": "That file is too large to download.",
			"error.actionFailed": "Action failed: {message}",
			"error.exists": "An entry of that name is already there.",
			"download.failed": "{count} file(s) could not start downloading: {message}",
			"path.input": "Path",
			"locations": "Jump to another location",
			"locations.workspaces": "Workspaces",
			"locations.other": "Other locations",
			"locations.cwd": "Current directory",
			"locations.home": "Home",
			"locations.recent": "Recent",
			"menu.open": "Open",
			"menu.compareSelect": "Select for Compare",
			"menu.compareWith": "Compare with Selected",
			"menu.timeline": "Open Timeline",
			"menu.copyPath": "Copy Path",
			"menu.copyRelativePath": "Copy Relative Path",
			"menu.download": "Download",
			"menu.downloadMany": "Download {count} Files",
			"menu.move": "Move to…",
			"menu.moveMany": "Move {count} Items…",
			"menu.rename": "Rename",
			"menu.delete": "Delete",
			"menu.deleteMany": "Delete {count} Items",
			"dialog.cancel": "Cancel",
			"dialog.close": "Close",
			"move.title": "Move to",
			"move.description": "Move \"{name}\" into:",
			"move.descriptionMany": "Move the {count} selected items into:",
			"move.input": "Destination directory",
			"move.confirm": "Move",
			"move.invalid": "Enter a destination directory.",
			"rename.title": "Rename",
			"rename.input": "New name",
			"rename.confirm": "Rename",
			"rename.invalid": "A name cannot be blank or contain \"/\" or \"\\\".",
			"delete.title": "Delete",
			"delete.description": "Delete \"{name}\"? This cannot be undone.",
			"delete.descriptionMany": "Delete these {count} items? This cannot be undone.",
			"delete.confirm": "Delete",
			"compare.title": "Compare",
			"compare.paths": "{base} ↔ {target}",
			"compare.truncated": "Only the first page of each file was compared.",
			"timeline.title": "Timeline",
			"timeline.empty": "This file has no commit history.",
			"timeline.date": "{y}-{m}-{d} {h}:{mi}",
			"timeline.meta": "{author} · {date}",
			"timeline.counts": "+{additions} −{deletions}",
			"diff.copy": "Copy",
			"diff.copied": "Copied",
			"diff.collapse": "Collapse",
			"diff.expand": "Expand {hidden} lines",
			"diff.collapseAria": "Collapse the hidden lines",
			"diff.expandAria": "Expand {hidden} hidden lines",
			"diff.files": "{count} files"
		};
		/**
		* Put `root` at the head of a tab's visited list, dropping any earlier visit to
		* it and the oldest entries past {@link RECENT_LIMIT}.
		* @param recent - the tab's visited directories, most recent first.
		* @param root - the directory now being rooted at.
		* @returns the new list.
		*/
		function visit(recent, root) {
			return [root, ...recent.filter((path) => path !== root)].slice(0, 8);
		}
		/**
		* One tab's bucket, which every writer after `start` relies on: the face only
		* dispatches while the record's signal is live, and `forget` runs on its abort.
		* @param state - the draft.
		* @param tabId - the tab being written.
		* @returns the tab's tree.
		*/
		function bucket(state, tabId) {
			const tree = state.byTab[tabId];
			if (tree === void 0) throw new Error(`ui-sidebar-files: no tree for tab "${tabId}"`);
			return tree;
		}
		/**
		* Declare the file tree's store.
		*
		* A factory rather than a shared handle: the registration declares it as an
		* exclusive store, so the framework mints one instance per session.
		* @returns the store handle to declare on the registration.
		*/
		function createFilesStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({ byTab: {} }),
				actions: {
					/**
					* Seed one tab's tree at its workspace root, with the root expanded.
					*
					* A new tab always starts here, at the session's own working directory:
					* nothing another tab navigated to can seed it.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param root - absolute path of the workspace root.
					*/
					start: (d, tabId, root) => {
						d.byTab[tabId] = {
							root,
							levels: {},
							expanded: [root],
							scrollTop: 0,
							recent: [root],
							compareBase: null,
							selected: [],
							anchor: null,
							uploads: []
						};
					},
					/**
					* Root one tab at another directory, as the address bar and the location
					* menu ask: the new root is the only expanded directory, nothing stays
					* loaded, the body starts at the top, and the visit joins the tab's own
					* recent list. A selection belongs to the directory it was made in, so it
					* ends here.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param root - absolute path of the directory to root at.
					*/
					navigate: (d, tabId, root) => {
						const state = bucket(d, tabId);
						state.root = root;
						state.levels = {};
						state.expanded = [root];
						state.scrollTop = 0;
						state.recent = visit(state.recent, root);
						state.selected = [];
						state.anchor = null;
					},
					/**
					* Set or clear one tab's compare base.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute path selected as the base, or null to clear it.
					*/
					compareSelected: (d, tabId, path) => {
						bucket(d, tabId).compareBase = path;
					},
					/**
					* Select exactly one entry, as an unmodified click does, and anchor a
					* range there.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute path of the entry clicked.
					*/
					selectOne: (d, tabId, path) => {
						const state = bucket(d, tabId);
						state.selected = [path];
						state.anchor = path;
					},
					/**
					* Add one entry to the selection, or drop it when it is already there, as
					* a Ctrl/Cmd click does; either way the anchor moves to it.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute path of the entry clicked.
					*/
					toggleSelected: (d, tabId, path) => {
						const state = bucket(d, tabId);
						state.selected = state.selected.includes(path) ? state.selected.filter((selected) => selected !== path) : [...state.selected, path];
						state.anchor = path;
					},
					/**
					* Replace the selection with one range, as a Shift click does. The anchor
					* stays where it is, so a second Shift click measures from the same entry.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param paths - the selected paths, in display order.
					*/
					selectRange: (d, tabId, paths) => {
						bucket(d, tabId).selected = [...paths];
					},
					/**
					* Drop one tab's selection, after a gesture consumed it — a move, a
					* removal — or after a new root made it meaningless.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					*/
					clearSelection: (d, tabId) => {
						const state = bucket(d, tabId);
						state.selected = [];
						state.anchor = null;
					},
					/**
					* Mark one directory as being listed.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute directory path.
					*/
					loading: (d, tabId, path) => {
						bucket(d, tabId).levels[path] = { kind: "loading" };
					},
					/**
					* Record one directory's contents.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute directory path.
					* @param level - the listing to show under it.
					*/
					loaded: (d, tabId, path, level) => {
						bucket(d, tabId).levels[path] = {
							kind: "ready",
							level
						};
					},
					/**
					* Record why one directory could not be listed.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute directory path.
					* @param failure - the settled Remote failure.
					*/
					failed: (d, tabId, path, failure) => {
						bucket(d, tabId).levels[path] = {
							kind: "failed",
							failure
						};
					},
					/**
					* Open a collapsed directory, or collapse an open one.
					*
					* A collapsed level keeps what it loaded, so reopening it draws at once.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute directory path.
					*/
					toggled: (d, tabId, path) => {
						const state = bucket(d, tabId);
						const at = state.expanded.indexOf(path);
						if (at >= 0) state.expanded.splice(at, 1);
						else state.expanded.push(path);
					},
					/**
					* Record where one tab's body is scrolled to.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param scrollTop - the body's scroll offset, in px.
					*/
					scrolled: (d, tabId, scrollTop) => {
						bucket(d, tabId).scrollTop = scrollTop;
					},
					/**
					* Drop every loaded level, keeping what is expanded.
					*
					* This is the reload gesture's first half: the expanded set says which
					* levels to fetch again.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					*/
					reset: (d, tabId) => {
						bucket(d, tabId).levels = {};
					},
					/**
					* Open one directory if it is closed.
					*
					* A landed upload reveals what it wrote, and this runs after an await, so
					* it states the outcome it wants rather than toggling what a stale
					* snapshot showed.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute directory path to open.
					*/
					expand: (d, tabId, path) => {
						const state = bucket(d, tabId);
						if (!state.expanded.includes(path)) state.expanded.push(path);
					},
					/**
					* Put one file on this tab's upload list, or restart its row: uploading a
					* name again after a refusal replaces that row rather than stacking a
					* second one beside it.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param task - the upload this tab just started.
					*/
					uploadQueued: (d, tabId, task) => {
						const state = bucket(d, tabId);
						state.uploads = [...state.uploads.filter((upload) => upload.path !== task.path), task];
					},
					/**
					* End one upload: a landed file leaves the list, a refused one keeps its
					* row carrying the failure, and `undefined` dismisses a refused row.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param path - absolute path of the file the upload targets.
					* @param failure - why the Host refused it, or undefined when it landed or is being dismissed.
					*/
					uploadFinished: (d, tabId, path, failure) => {
						const state = bucket(d, tabId);
						state.uploads = failure === void 0 ? state.uploads.filter((upload) => upload.path !== path) : state.uploads.map((upload) => upload.path === path ? {
							...upload,
							failure
						} : upload);
					},
					/**
					* Forget one tab's tree, for a tab record that is gone.
					* @param d - draft state.
					* @param tabId - the tab that went away.
					*/
					forget: (d, tabId) => {
						d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId));
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "sidebarFiles";
		/**
		* Required browser services: the tab registry, the keyed seat, the Remote
		* carrier and its namespace, and copy.
		*/
		const inject = [
			"slots",
			"locale",
			"sidebarRightTabs",
			"remote",
			"remote.workspaceFiles"
		];
		/**
		* Client plugin body: register the type, its dictionaries, its body, and its chip title.
		* @param ctx - client root context carrying the registry, the slots, and the Remote face.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.sidebarRightTabs.register(filesDefinition(t)), "ui-sidebar-files: files type");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-sidebar-files: dictionaries");
			const store = createFilesStore();
			const inject = filesFace(createFilesRemote(ctx.remote), () => ctx.remote.$host.home);
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: FILES_ID,
				locale: NS,
				store,
				inject
			}, FilesBody)), "ui-sidebar-files: files tab body");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: FILES_ID
			}, FilesTitle)), "ui-sidebar-files: files tab title");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map