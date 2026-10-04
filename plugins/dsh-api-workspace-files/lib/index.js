import { lstat, rename, rm, unlink } from "node:fs/promises";
import { posix, win32 } from "node:path";
import z from "@deepseek-ai/schemastery";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { Deque } from "@deepseek-ai/dsh-deque";
//#region lib/types/changes.js
/**
* Producer of the `changes` stream: every `fs/observed` emission whose target
* lies inside a generation's workspace root becomes one frame of that
* generation. Instrumented filesystem operations emit these observations; the
* operating system is not watched.
* Each generation acknowledges its observation queue and resolved workspace
* root with `ready` before emitting any queued or live changes.
*/
/** Owns `fs/observed` observation and every open `changes` generation. */
var WorkspaceChangeFeed = class {
	ctx;
	followers = /* @__PURE__ */ new Set();
	/** @param ctx - Host context carrying the filesystem the observations come from. */
	constructor(ctx) {
		this.ctx = ctx;
		ctx.on("fs/observed", (target, observation) => {
			for (const follower of this.followers) follower.push([target, observation]);
		});
		ctx.effect(() => () => {
			for (const follower of this.followers) follower.close();
			this.followers.clear();
		}, "workspace-files.changes");
	}
	/**
	* Open one generation reporting observations inside `workspaceRoot`.
	* @param workspaceRoot - the session's workspace root path.
	* @param signal - generation cancellation.
	* @returns `ready` after observation is active and the root resolves, then
	*   observations made after the generation was first pulled, in emission order.
	*/
	async *follow(workspaceRoot, signal) {
		signal.throwIfAborted();
		const follower = new ChangeFollower();
		this.followers.add(follower);
		try {
			const root = await this.ctx.fs.resolve(workspaceRoot, { signal }).catch((error) => {
				if (signal.aborted) return void 0;
				throw error;
			});
			if (root === void 0 || signal.aborted || follower.isClosed) return;
			yield { kind: "ready" };
			for await (const [target, observation] of follower.read(signal)) {
				if (!this.ctx.fs.contains(root, target)) continue;
				const absolutePath = this.ctx.fs.processPath(target);
				yield {
					kind: "change",
					change: observation.kind === "present" ? {
						absolutePath,
						version: observation.version
					} : {
						absolutePath,
						absent: true
					}
				};
			}
		} finally {
			this.followers.delete(follower);
			follower.close();
		}
	}
};
/** One generation's queue: observations wait here until its consumer pulls them. */
var ChangeFollower = class {
	queue = new Deque();
	wake;
	closed = false;
	/** Whether the generation was closed while its workspace root resolved. */
	get isClosed() {
		return this.closed;
	}
	push(observed) {
		this.queue.pushBack(observed);
		this.wake?.();
	}
	close() {
		this.closed = true;
		this.wake?.();
	}
	/** Drain until closed or aborted; anything still queued then is dropped with the generation. */
	async *read(signal) {
		const abort = () => {
			this.close();
		};
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
		try {
			while (!this.closed) {
				const observed = this.queue.popFront();
				if (observed !== void 0) {
					yield observed;
					continue;
				}
				await new Promise((resolve) => {
					this.wake = resolve;
				});
				this.wake = void 0;
			}
		} finally {
			signal.removeEventListener("abort", abort);
		}
	}
};
//#endregion
//#region lib/types/download.js
/**
* The browser download route: one workspace file handed to the browser as a
* stream, so a download is bounded by no complete-file cap.
*
* A Remote answer carries one base64 window that the whole JSON-RPC envelope
* must hold, which is why `readAll` refuses a file above `maxFileBytes`. A
* download instead travels over the browser's own HTTP carrier: the route reads
* the file one `maxBytes` window at a time through `ctx.fs` and enumerates them
* into the response, so the Host never holds the file and the browser writes it
* straight to disk. The route lives under the `/api` channel, so the connection
* service's Host/Origin fence and browser authentication run before the handler.
*
* @module @deepseek-ai/dsh-api-workspace-files/download
*/
/** The exact `/api` route a browser download reads. */
const WORKSPACE_DOWNLOAD_PATH = "/api/workspace.download";
/**
* Headers every download answer carries.
*
* `octet-stream` is deliberate whatever the file is: the answer is an
* attachment, never something a browser may render from the API origin.
*/
const DOWNLOAD_HEADERS = {
	"content-type": "application/octet-stream",
	"cache-control": "private, no-store",
	"x-content-type-options": "nosniff",
	"content-security-policy": "sandbox; default-src 'none'"
};
/** One RFC 5987 `attr-char` escape: the characters `encodeURIComponent` leaves that a token cannot carry. */
const ATTR_CHAR_ESCAPE = /['()*]/gu;
/**
* The `Content-Disposition` value that saves one file under its own name.
*
* The quoted `filename` carries an ASCII-only fallback and `filename*` the real
* name, so a name outside ASCII survives on a browser that reads RFC 5987 and
* degrades to a readable stand-in on one that does not.
* @param name - the file's basename.
* @returns the header value.
*/
function contentDisposition(name) {
	return `attachment; filename="${name.replace(/[^\u0020-\u007e]/gu, "_").replace(/["\\]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(name).replace(ATTR_CHAR_ESCAPE, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
/**
* The HTTP status one refused download answers with, from the code the failure
* carries.
*
* Both vocabularies a read can raise are read the same way, by their code
* value: this service's own `RemoteError` codes and the filesystem backend's
* `FsError` codes never overlap, and neither class identity crosses the package
* boundary. An unclassified failure is a `500`, because nothing here knows
* anything more useful to say about it.
* @param code - the failure's code, whatever kind of error carried it.
* @returns the status to answer with.
*/
function downloadStatus(code) {
	switch (code) {
		case "workspace-file/not-found":
		case "FS_NOT_FOUND": return 404;
		case "workspace-file/not-regular-file":
		case "workspace-file/outside-workspace":
		case "FS_NOT_REGULAR_FILE":
		case "FS_PERMISSION_DENIED":
		case "FS_SANDBOX_DENIED": return 403;
		case "gateway/bad-request": return 400;
		case "FS_ABORTED": return 499;
		default: return 500;
	}
}
/**
* Enumerate one file's bytes into a response body, one window at a time.
*
* The reader is pulled rather than pushed: nothing is read until the consumer
* asks for another chunk, which is what keeps a slow browser from making the
* Host accumulate the file. The stream ends at the first short window, at the
* size a stat reported, or at the first empty window for a backend that reports
* no size. A failing read errors the stream, so a truncated download is a
* failed one rather than a shorter file.
* @param readWindow - reads the bytes at `[offset, offset + length)`, shorter only at the file's end.
* @param size - the file's complete byte size when the backend reports it.
* @param chunkBytes - the largest window one read asks for.
* @returns the response body.
*/
function byteStream(readWindow, size, chunkBytes) {
	let offset = 0;
	return new ReadableStream({ async pull(controller) {
		const window = await readWindow(offset, chunkBytes);
		if (window.byteLength === 0) {
			controller.close();
			return;
		}
		offset += window.byteLength;
		controller.enqueue(window);
		if (size === void 0 ? window.byteLength < chunkBytes : offset >= size) controller.close();
	} });
}
//#endregion
//#region lib/types/index.js
/**
* Workspace file service: file previews, directory listings, workspace-confined
* rename, move, and removal, version-guarded text replacement, browser
* downloads, file history, and the filesystem-observation change feed, exposed
* as `workspaceFiles`.
*
* File reads follow the composed filesystem's read access, including paths
* outside the workspace, and so do directory listings. The selected Session
* header supplies the base for relative paths, with the sandbox policy root as
* its no-cwd fallback, not a read-containment restriction. `rename`, `move`,
* and `delete` are deliberately workspace-confined, and they call `node:fs`
* directly because the `ctx.fs` seam exposes no rename, move, or remove
* operation. `write` is the fourth mutation and takes the opposite route: it
* replaces a file's complete text through `ctx.fs`, so the composed backend's
* own write policy fences it and the caller must present the version it read.
* `history` reads a file's `git log` through the subprocess seam. Change
* observations remain workspace-scoped. File-kind checks and configured read
* caps apply to every preview.
*
* One read travels outside the Remote face: the browser download route streams a
* whole file through the `/api` carrier, one configured window at a time, so a
* file above `maxFileBytes` — the cap on a single Remote answer — is still
* downloadable. See `download.ts`.
*
* A page is cut from `streamText`, which decodes and rejects non-UTF-8 as it
* goes, so the file is read only up to the first character past the page and
* never held whole in memory; the NUL scan runs on the page itself.
*
* This is NOT modelled on `session.openWorkspacePath`. That endpoint hands a
* path to the local opener and leaves the effect on the machine; this one sends
* file content across the wire, which is a different level of exposure.
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* Canonical padded base64: whole four-character groups, with only the final
* group shortened and padded. `Buffer.from` decodes loosely — it ignores
* padding in the middle and truncates a partial group — so a payload that is
* not this shape would be stored as something other than what the caller sent.
*/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
/** The byte text never carries: its presence marks a page as binary. */
const NUL = String.fromCharCode(0);
/** The unit-separator byte `GIT_LOG_FORMAT` joins one commit's fields with. */
const GIT_LOG_FIELD_SEPARATOR = "";
/** `git log` record format: full hash, short hash, author, ISO-8601 author date, subject. */
const GIT_LOG_FORMAT = `%H${GIT_LOG_FIELD_SEPARATOR}%h${GIT_LOG_FIELD_SEPARATOR}%an${GIT_LOG_FIELD_SEPARATOR}%ad${GIT_LOG_FIELD_SEPARATOR}%s`;
/** Commit cap on one file's history: the newest records the timeline shows. */
const GIT_LOG_LIMIT = 50;
/** Retained `git log` stdout cap; the bounded record count stays far below it. */
const GIT_LOG_MAX_BYTES = 1024 * 1024;
/** Retained `git log` stderr tail cap; the tail is diagnostic and never read. */
const GIT_LOG_STDERR_MAX_BYTES = 64 * 1024;
/**
* Terminate-escalation grace for one `git log` call. Fixed: it bounds how long
* a terminating child may take, and is not a deployment policy.
*/
const GIT_LOG_GRACE_MS = 5e3;
/** Refuse anything the wire schema admits as a number but a window cannot use: only safe integers index a file. */
function integerAtLeast(value, min, name) {
	if (!Number.isSafeInteger(value) || value < min) throw new RemoteError("gateway/bad-request", `${name} must be a safe integer of at least ${min}`, {});
	return value;
}
/**
* Validate one rename name as a single path segment: a rename may not move an
* entry to another directory. Rejects an empty or whitespace-padded name, any
* separator or NUL byte, and the `.` / `..` entries.
* @param newName - the requested basename on the wire.
* @returns the accepted name, unchanged.
*/
function segmentName(newName) {
	if (newName.length === 0 || newName !== newName.trim() || newName === "." || newName === ".." || newName.includes("/") || newName.includes("\\") || newName.includes(NUL)) throw new RemoteError("gateway/bad-request", `"${newName}" must be a single path segment`, {});
	return newName;
}
/**
* One numstat field as a line count: a decimal count, or 0 when git reports the
* change as binary (`-`).
* @param text - the additions or deletions field of one numstat line.
* @returns the parsed count, or 0 when the field is not a number.
*/
function lineCount(text) {
	const count = Number(text);
	return Number.isFinite(count) ? count : 0;
}
/**
* One field of a split line, empty when the line carried fewer fields.
* @param fields - the line split on its separator.
* @param index - zero-based field index.
* @returns the field, or an empty string when the line is short.
*/
function field(fields, index) {
	return fields[index] ?? "";
}
/**
* Parse the stdout of the `git log` invocation `history` runs: one entry per
* commit, in git's output order. A record line carries five unit-separated
* fields, and the tab-separated numstat lines that follow it — one per changed
* path, or none — supply the line counts. Blank lines separate records and are
* ignored.
* @param stdout - complete raw stdout of `git log --format=… --numstat`.
* @returns one entry per record, in the order git printed them.
*/
function parseGitLog(stdout) {
	const entries = [];
	let record;
	for (const line of stdout.split("\n")) {
		if (line.includes(GIT_LOG_FIELD_SEPARATOR)) {
			const fields = line.split(GIT_LOG_FIELD_SEPARATOR);
			record = {
				hash: field(fields, 0),
				shortHash: field(fields, 1),
				author: field(fields, 2),
				date: field(fields, 3),
				subject: fields.slice(4).join(GIT_LOG_FIELD_SEPARATOR),
				additions: 0,
				deletions: 0
			};
			entries.push(record);
			continue;
		}
		const counts = line.split("	");
		if (record === void 0 || counts.length < 3) continue;
		record.additions += lineCount(field(counts, 0));
		record.deletions += lineCount(field(counts, 1));
	}
	return entries;
}
/**
* Cut lines `offset` through `offset + limit - 1` from decoded chunks, stopping
* at the first character past the page so the rest of the file is never read.
* Lines before the page are counted, not kept, and the page is refused the
* moment its bytes exceed `maxBytes`, so one giant line cannot grow memory past
* the cap either.
*/
async function cutPage(chunks, offset, limit, maxBytes, path) {
	const last = offset + limit - 1;
	const lines = [];
	let current = "";
	let bytes = 0;
	let lineNumber = 1;
	const admit = (size) => {
		bytes += size;
		if (bytes > maxBytes) throw new RemoteError("workspace-file/too-large", `lines ${offset}-${last} of "${path}" exceed the ${maxBytes} byte cap`, {
			path,
			limit: maxBytes
		});
	};
	const complete = () => {
		if (lines.length > 0) admit(1);
		lines.push(current);
		current = "";
	};
	for await (const chunk of chunks) {
		let position = 0;
		while (position < chunk.length) {
			if (lineNumber > last) return {
				text: lines.join("\n"),
				lines: lines.length,
				eof: false
			};
			const newline = chunk.indexOf("\n", position);
			const segment = newline === -1 ? chunk.slice(position) : chunk.slice(position, newline);
			if (lineNumber >= offset) {
				admit(Buffer.byteLength(segment, "utf8"));
				current += segment;
			}
			if (newline === -1) break;
			if (lineNumber >= offset) complete();
			lineNumber += 1;
			position = newline + 1;
		}
	}
	if (current.length > 0) complete();
	return {
		text: lines.join("\n"),
		lines: lines.length,
		eof: true
	};
}
/**
* Workspace path of `target` relative to `root`, derived from the two canonical
* `file:` URIs so the answer is `/`-joined on every platform. Empty for the root.
*/
function workspacePathOf(rootUrl, targetUrl) {
	const root = new URL(rootUrl).pathname.replace(/\/+$/, "");
	const target = new URL(targetUrl).pathname;
	if (target === root) return "";
	return target.slice(root.length + 1).split("/").map(decodeURIComponent).join("/");
}
/**
* The path implementation matching one backend process path: POSIX when the
* path is `/`-rooted, Windows otherwise. The host platform may differ from the
* execution platform the process path belongs to.
* @param absolute - an absolute path in the filesystem's execution world.
* @returns the matching `node:path` implementation.
*/
function processPathsFor(absolute) {
	return absolute.startsWith("/") ? posix : win32;
}
/** Strip the resolved child target: the wire carries names and metadata only. */
function directoryEntry(child) {
	return {
		name: child.name,
		type: child.type,
		...child.size === void 0 ? {} : { size: child.size }
	};
}
/**
* Host Remote file reads, directory listings, workspace-confined rename, move,
* and removal, version-guarded text replacement, the browser download route,
* per-file git history, and the instrumented filesystem change feed.
*
* `rename`, `move`, and `delete` are confined to the Session's workspace root
* and call `node:fs` because the `ctx.fs` seam exposes none of those
* operations; every other path-taking method uses `ctx.fs`, whose access rules
* then apply — including `write`, whose fence is the backend's write policy.
*/
let WorkspaceFiles = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _read_decorators;
	let _readBytes_decorators;
	let _readAll_decorators;
	let _readRelated_decorators;
	let _stat_decorators;
	let _list_decorators;
	let _rename_decorators;
	let _move_decorators;
	let _delete_decorators;
	let _write_decorators;
	let _upload_decorators;
	let _history_decorators;
	let _changes_decorators;
	return class WorkspaceFiles extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_read_decorators = [Remote];
			_readBytes_decorators = [Remote];
			_readAll_decorators = [Remote];
			_readRelated_decorators = [Remote];
			_stat_decorators = [Remote];
			_list_decorators = [Remote];
			_rename_decorators = [Remote];
			_move_decorators = [Remote];
			_delete_decorators = [Remote];
			_write_decorators = [Remote];
			_upload_decorators = [Remote];
			_history_decorators = [Remote];
			_changes_decorators = [Remote({ mode: "stream" })];
			__esDecorate(this, null, _read_decorators, {
				kind: "method",
				name: "read",
				static: false,
				private: false,
				access: {
					has: (obj) => "read" in obj,
					get: (obj) => obj.read
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _readBytes_decorators, {
				kind: "method",
				name: "readBytes",
				static: false,
				private: false,
				access: {
					has: (obj) => "readBytes" in obj,
					get: (obj) => obj.readBytes
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _readAll_decorators, {
				kind: "method",
				name: "readAll",
				static: false,
				private: false,
				access: {
					has: (obj) => "readAll" in obj,
					get: (obj) => obj.readAll
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _readRelated_decorators, {
				kind: "method",
				name: "readRelated",
				static: false,
				private: false,
				access: {
					has: (obj) => "readRelated" in obj,
					get: (obj) => obj.readRelated
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _stat_decorators, {
				kind: "method",
				name: "stat",
				static: false,
				private: false,
				access: {
					has: (obj) => "stat" in obj,
					get: (obj) => obj.stat
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _rename_decorators, {
				kind: "method",
				name: "rename",
				static: false,
				private: false,
				access: {
					has: (obj) => "rename" in obj,
					get: (obj) => obj.rename
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _move_decorators, {
				kind: "method",
				name: "move",
				static: false,
				private: false,
				access: {
					has: (obj) => "move" in obj,
					get: (obj) => obj.move
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _delete_decorators, {
				kind: "method",
				name: "delete",
				static: false,
				private: false,
				access: {
					has: (obj) => "delete" in obj,
					get: (obj) => obj.delete
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _write_decorators, {
				kind: "method",
				name: "write",
				static: false,
				private: false,
				access: {
					has: (obj) => "write" in obj,
					get: (obj) => obj.write
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _upload_decorators, {
				kind: "method",
				name: "upload",
				static: false,
				private: false,
				access: {
					has: (obj) => "upload" in obj,
					get: (obj) => obj.upload
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _history_decorators, {
				kind: "method",
				name: "history",
				static: false,
				private: false,
				access: {
					has: (obj) => "history" in obj,
					get: (obj) => obj.history
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _changes_decorators, {
				kind: "method",
				name: "changes",
				static: false,
				private: false,
				access: {
					has: (obj) => "changes" in obj,
					get: (obj) => obj.changes
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static inject = [
			"fs",
			"sandboxPolicy",
			"sessions",
			"typert",
			"subprocess"
		];
		static Config = z.object({
			maxBytes: z.number().step(1).min(1).default(2 * 1024 * 1024),
			maxFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER - 1).default(32 * 1024 * 1024),
			maxLines: z.number().step(1).min(1).default(5e3),
			maxEntries: z.number().step(1).min(1).default(2e3)
		});
		feed;
		/**
		* @param ctx - Host context carrying the filesystem and the sandbox policy.
		* @param config - deployment caps on one page or one listing.
		*/
		constructor(ctx, config) {
			super(ctx, "workspaceFiles");
			this.config = config;
			this.feed = new WorkspaceChangeFeed(ctx);
			ctx.inject(["sessions", "typert"], (scope) => {
				scope.typert.lookups.register("workspaceFileScope", {
					parameter: "workspaceFileScope",
					wire: "workspaceFileScopeId",
					hostTypeSymbol: "@deepseek-ai/dsh-api-workspace-files#WorkspaceFileScope",
					wireTypeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
					resolve: async (sessionId) => this.resolveScope(sessionId)
				});
			});
			ctx.inject(["connection"], (connectionCtx) => {
				connectionCtx.effect(() => connectionCtx.connection.fetch.register({
					path: WORKSPACE_DOWNLOAD_PATH,
					methods: ["GET", "HEAD"],
					requestBody: "buffered",
					fetch: (request) => this.download(request)
				}), "workspace-files: browser download route");
			});
		}
		/**
		* Resolve one Session identity to the workspace root its files are read
		* against, from the live header or the stored one, without loading the
		* session's event body or activating an Agent.
		* @param sessionId - Session identity received on the wire.
		* @returns the scope, or undefined when no header knows that Session.
		*/
		async resolveScope(sessionId) {
			const live = this.ctx.sessions.get(sessionId)?.header;
			const stored = live === void 0 ? await this.ctx.get("sessionPersistence")?.stat(sessionId) : void 0;
			const header = live ?? stored?.header;
			if (header === void 0) return void 0;
			return {
				sessionId,
				workspaceRoot: header.cwd ?? this.ctx.sandboxPolicy.workspaceRoot
			};
		}
		/**
		* Read one page of lines from a UTF-8 file readable by the filesystem backend.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root; files outside it are allowed.
		* @param range - the line window; omitted fields take the page defaults.
		* @param signal - caller cancellation.
		* @returns the page, the file's version at the stat before it, and whether it reaches the last line.
		*/
		async read(workspaceFileScope, path, range, signal) {
			const { offset, limit } = this.resolvePage(range);
			const { target, info } = await this.locateFile(workspaceFileScope, path, signal);
			const page = await this.cutPage(target, offset, limit, signal, path);
			if (page.text.includes(NUL)) throw new RemoteError("workspace-file/not-text", `"${path}" contains NUL bytes`, { path });
			return {
				...this.statOf(target, info),
				offset,
				text: page.text,
				lines: page.lines,
				eof: page.eof
			};
		}
		/**
		* Read one byte window of a regular file readable by the filesystem backend: raw
		* bytes, no text decoding and no binary rejection.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root; files outside it are allowed.
		* @param range - the byte window; omitted fields take the window defaults.
		* @param signal - caller cancellation.
		* @returns the window in base64, the file's version and size at the stat before it, and whether it reaches the last byte.
		*/
		async readBytes(workspaceFileScope, path, range, signal) {
			const { offset, length } = this.resolveWindow(range, path);
			const { target, info } = await this.locateFile(workspaceFileScope, path, signal);
			const data = await this.ctx.fs.readByteRange(target, {
				offset,
				length
			}, signal);
			const eof = info.size === void 0 ? data.length < length : offset + data.length >= info.size;
			return {
				...this.statOf(target, info),
				offset,
				data: Buffer.from(data).toString("base64"),
				eof
			};
		}
		/**
		* Read a complete regular file as bytes, subject to the configured full-file cap.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute or workspace-relative file path.
		* @param signal - caller cancellation.
		* @returns one complete base64 window with offset zero and eof true; oversized files fail with too-large.
		*/
		async readAll(workspaceFileScope, path, signal) {
			const { target, info } = await this.locateFile(workspaceFileScope, path, signal);
			const limit = this.config.maxFileBytes;
			if (info.size !== void 0 && info.size > limit) throw new RemoteError("workspace-file/too-large", `"${path}" exceeds the ${limit} byte full-file cap`, {
				path,
				limit
			});
			const data = await this.ctx.fs.readByteRange(target, {
				offset: 0,
				length: limit + 1
			}, signal);
			if (data.length > limit) throw new RemoteError("workspace-file/too-large", `"${path}" exceeds the ${limit} byte full-file cap`, {
				path,
				limit
			});
			return {
				...this.statOf(target, info),
				offset: 0,
				data: Buffer.from(data).toString("base64"),
				eof: true
			};
		}
		/**
		* Read a complete file relative to another file's directory, including outside the workspace.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - base file, absolute or workspace-relative.
		* @param relativePath - relative filesystem path, not a URL or absolute path.
		* @param signal - caller cancellation.
		* @returns the complete related file using the ordinary file-size and access checks.
		*/
		async readRelated(workspaceFileScope, path, relativePath, signal) {
			const relative = relativePath.replace(/\\/g, "/");
			if (relative.length === 0 || relative.startsWith("/") || /^[a-z][a-z\d+.-]*:/iu.test(relative) || relative.includes(NUL)) throw new RemoteError("gateway/bad-request", "relativePath must be a relative filesystem path", {});
			const { target } = await this.locateFile(workspaceFileScope, path, signal);
			const absolute = this.ctx.fs.processPath(target);
			const paths = processPathsFor(absolute);
			return this.readAll(workspaceFileScope, paths.resolve(paths.dirname(absolute), relative), signal);
		}
		/**
		* Report one regular file's identity, version, and size without its content.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root; files outside it are allowed.
		* @param signal - caller cancellation.
		* @returns the file's absolute path, current version, and byte size.
		*/
		async stat(workspaceFileScope, path, signal) {
			const { target, info } = await this.locateFile(workspaceFileScope, path, signal);
			return this.statOf(target, info);
		}
		/**
		* List the direct children of one existing directory readable by the
		* filesystem backend, anywhere that backend can reach.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root; directories outside it are allowed.
		* @param signal - caller cancellation.
		* @returns the directory's children in the backend's stable name order, bounded by the entry
		*   cap, and the listed directory as a workspace path or, outside the root, as its absolute path.
		*/
		async list(workspaceFileScope, path, signal) {
			const { root, workspaceRoot, entry } = await this.inspect(workspaceFileScope, path, signal);
			if (entry.type !== "directory") throw new RemoteError("workspace-file/not-directory", `"${path}" is a ${entry.type}`, {
				path,
				kind: entry.type
			});
			const target = await this.ctx.fs.resolve(path, {
				cwd: workspaceRoot,
				signal
			});
			const children = await this.ctx.fs.listDir(target, signal);
			return {
				path: this.listingPathOf(root, target),
				entries: children.slice(0, this.config.maxEntries).map(directoryEntry),
				truncated: children.length > this.config.maxEntries
			};
		}
		/**
		* Rename one entry inside the Session's workspace to a new name in the same
		* directory. The rename itself runs through `node:fs`, because the `ctx.fs`
		* seam exposes no rename operation; the destination directory is still
		* checked with `ctx.fs`. A final symlink is renamed without following it.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root of the entry to rename.
		* @param newName - the entry's new name: one path segment, without separators, `.` or `..`.
		* @param signal - caller cancellation.
		* @returns the renamed entry's absolute path.
		*/
		async rename(workspaceFileScope, path, newName, signal) {
			const name = segmentName(newName);
			const { root, workspaceRoot } = await this.inspect(workspaceFileScope, path, signal);
			const { absolute, isRoot } = await this.entryPath(root, workspaceRoot, path, signal);
			const paths = processPathsFor(absolute);
			const directory = paths.dirname(absolute);
			if (isRoot) throw new RemoteError("workspace-file/outside-workspace", `"${path}" is outside the workspace`, { path });
			const destination = paths.join(directory, name);
			await rename(absolute, destination);
			return { absolutePath: destination };
		}
		/**
		* Move entries into another directory of the Session's workspace, keeping each
		* entry's own name. The move runs through `node:fs` like `rename`, because the
		* `ctx.fs` seam exposes no move operation, and both ends are checked with
		* `ctx.fs`: an entry whose directory leaves the workspace root, a destination
		* outside it, and an entry asked to move into itself or into its own subtree
		* are refused. Final symlinks move as entries without following their targets.
		*
		* The complete request is validated before the first entry moves, so a refusal
		* leaves every requested entry where it was. An entry already in the
		* destination directory is left alone and reported at that same path, which
		* makes a drop onto the directory entry it came from a no-op rather than an
		* error. A destination name already taken is refused rather than overwritten,
		* and so is a second requested entry that would land on the same name.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param paths - absolute paths or paths relative to the workspace root of the entries to move.
		* @param destination - absolute path or path relative to the workspace root of the target directory.
		* @param signal - caller cancellation.
		* @returns the destination's absolute path and one entry per requested path, in request order.
		*/
		async move(workspaceFileScope, paths, destination, signal) {
			if (paths.length === 0) throw new RemoteError("gateway/bad-request", "paths must not be empty", {});
			const { root, workspaceRoot, entry } = await this.inspect(workspaceFileScope, destination, signal);
			if (entry.type !== "directory") throw new RemoteError("workspace-file/not-directory", `"${destination}" is a ${entry.type}`, {
				path: destination,
				kind: entry.type
			});
			const destinationTarget = await this.confine(root, workspaceRoot, destination, signal);
			const destinationAbsolute = this.ctx.fs.processPath(destinationTarget);
			const plans = [];
			const taken = /* @__PURE__ */ new Set();
			for (const path of paths) {
				await this.inspect(workspaceFileScope, path, signal);
				const { absolute, isRoot } = await this.entryPath(root, workspaceRoot, path, signal);
				if (isRoot) throw new RemoteError("gateway/bad-request", "the workspace root cannot be moved", {});
				const sourcePaths = processPathsFor(absolute);
				const relativeDestination = sourcePaths.relative(absolute, destinationAbsolute);
				if (relativeDestination === "" || relativeDestination !== ".." && !relativeDestination.startsWith(`..${sourcePaths.sep}`) && !sourcePaths.isAbsolute(relativeDestination)) throw new RemoteError("gateway/bad-request", `"${path}" cannot be moved into itself`, {});
				const directory = sourcePaths.dirname(absolute);
				const target = sourcePaths.join(destinationAbsolute, sourcePaths.basename(absolute));
				if (sourcePaths.normalize(directory) === sourcePaths.normalize(destinationAbsolute)) {
					plans.push({
						from: absolute,
						to: absolute,
						move: false
					});
					continue;
				}
				if (taken.has(target)) throw new RemoteError("workspace-file/exists", `two entries would land on "${target}"`, { path: target });
				if (await this.ctx.fs.lstat(target, { cwd: workspaceRoot }, signal) !== void 0) throw new RemoteError("workspace-file/exists", `"${target}" already exists`, { path: target });
				taken.add(target);
				plans.push({
					from: absolute,
					to: target,
					move: true
				});
			}
			const moved = [];
			for (const plan of plans) {
				if (plan.move) await rename(plan.from, plan.to);
				moved.push({
					from: plan.from,
					absolutePath: plan.to
				});
			}
			return {
				destination: destinationAbsolute,
				entries: moved
			};
		}
		/**
		* Permanently delete one entry inside the Session's workspace: a regular
		* file, a symlink, or a directory with everything below it. The deletion runs
		* through `node:fs`, because the `ctx.fs` seam exposes no remove operation;
		* the workspace root check still uses `ctx.fs`. Final symlinks and Windows
		* junctions are unlinked without deleting their targets.
		*
		* The wire name is `delete`, not `remove`: the generated namespace service
		* reserves `remove` for its own member, and a Remote method that shadows it
		* is refused when the namespace installs on the Client.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root of the entry to delete.
		* @param signal - caller cancellation.
		* @returns the deleted entry's absolute path.
		*/
		async delete(workspaceFileScope, path, signal) {
			const { root, workspaceRoot } = await this.inspect(workspaceFileScope, path, signal);
			const { absolute, isRoot } = await this.entryPath(root, workspaceRoot, path, signal);
			if (isRoot) throw new RemoteError("gateway/bad-request", "the workspace root cannot be removed", {});
			if ((await lstat(absolute)).isSymbolicLink()) await unlink(absolute);
			else await rm(absolute, {
				recursive: true,
				force: false
			});
			return { absolutePath: absolute };
		}
		/**
		* Replace one regular file's complete UTF-8 text, guarded by the version the
		* caller read. The write runs through the composed filesystem, so that
		* backend's write policy decides whether it happens: a session whose sandbox
		* mode is read-only refuses every write, and workspace-write accepts only a
		* target under that session's workspace root. A path outside those rules,
		* and a file that changed since it was read, are refusals rather than
		* overwrites — this endpoint never writes a file the caller has not read.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root of the file to replace.
		* @param text - the file's complete new content.
		* @param version - the version the caller's text was read at, from `stat` or an earlier `read`.
		* @param signal - caller cancellation.
		* @returns the file's absolute path, its version after the write, and the written byte count.
		*/
		async write(workspaceFileScope, path, text, version, signal) {
			if (version.length === 0) throw new RemoteError("gateway/bad-request", "version is required", {});
			const bytes = Buffer.byteLength(text, "utf8");
			const limit = this.config.maxFileBytes;
			if (bytes > limit) throw new RemoteError("workspace-file/too-large", `"${path}" exceeds the ${limit} byte full-file cap`, {
				path,
				limit
			});
			const { target } = await this.locateFile(workspaceFileScope, path, signal);
			const expected = {
				kind: "replaceIfVersion",
				version
			};
			let outcome;
			try {
				outcome = await this.ctx.fs.writeText(target, text, expected, signal, this.writePolicy(workspaceFileScope));
			} catch (error) {
				throw writeRefusal(error, path);
			}
			return {
				absolutePath: this.ctx.fs.processPath(target),
				version: outcome.version,
				bytes
			};
		}
		/**
		* Create one new file from exact bytes. This is the FILE MANAGER's upload: a
		* reader drops a file from their machine into a workspace directory, and the
		* bytes arrive base64-encoded under the same complete-file cap `readAll`
		* answers with. It always guards with `createIfAbsent`, so an upload never
		* replaces a file the caller has not read — a name already taken is refused
		* with `workspace-file/exists`, and replacing it is the reader's separate
		* decision through `delete` or an edit.
		*
		* The write runs through the composed filesystem with the Session's resolved
		* policy, exactly as `write` does, so it is fenced by the sandbox rather than
		* by a containment check here.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root of the file to create.
		* @param data - the complete file contents, base64-encoded.
		* @param signal - caller cancellation.
		* @returns the created file's absolute path, version, and byte size.
		*/
		async upload(workspaceFileScope, path, data, signal) {
			if (path.length === 0) throw new RemoteError("gateway/bad-request", "path is required", {});
			segmentName(path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1));
			if (!BASE64.test(data)) throw new RemoteError("gateway/bad-request", "data must be base64", {});
			const content = Buffer.from(data, "base64");
			const limit = this.config.maxFileBytes;
			if (content.byteLength > limit) throw new RemoteError("workspace-file/too-large", `"${path}" exceeds the ${limit} byte full-file cap`, {
				path,
				limit
			});
			const target = await this.ctx.fs.resolve(path, {
				cwd: workspaceFileScope.workspaceRoot,
				signal
			});
			let outcome;
			try {
				outcome = await this.ctx.fs.writeBytes(target, content, { kind: "createIfAbsent" }, signal, this.writePolicy(workspaceFileScope));
			} catch (error) {
				throw uploadRefusal(error, path);
			}
			return {
				absolutePath: this.ctx.fs.processPath(target),
				version: outcome.version,
				bytes: content.byteLength
			};
		}
		/**
		* Report one file's git history, newest commit first, by running `git log`
		* through the subprocess seam. The file may be inside or outside the
		* workspace. A directory that is not a repository, a file git never
		* committed, and a missing git executable all report an empty history
		* instead of failing; caller cancellation still propagates.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param path - absolute path or path relative to the workspace root of the file.
		* @param signal - caller cancellation.
		* @returns the file's absolute path and its commits, empty when git reports none.
		*/
		async history(workspaceFileScope, path, signal) {
			const { target } = await this.locateFile(workspaceFileScope, path, signal);
			const absolute = this.ctx.fs.processPath(target);
			const paths = processPathsFor(absolute);
			return {
				path: absolute,
				entries: await this.gitLog(paths.dirname(absolute), paths.basename(absolute), signal)
			};
		}
		/**
		* Stream every `fs/observed` observation of a file inside the Session's
		* workspace. Only instrumented filesystem operations report here; the OS is
		* not watched.
		* @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
		* @param signal - generation cancellation.
		* @returns `ready` once the Host observation queue is active and the workspace
		*   root is resolved, then queued and live observations in emission order.
		*/
		changes(workspaceFileScope, signal) {
			return this.feed.follow(workspaceFileScope.workspaceRoot, signal);
		}
		/**
		* The per-call sandbox policy one write runs under: the live Session's mode
		* when that Session is loaded, over the root this scope already resolved. A
		* cold Session has no log to read a mode from, so the deployment default
		* governs it while the header-derived root still bounds it.
		*/
		writePolicy(workspaceFileScope) {
			const live = this.ctx.sessions.get(workspaceFileScope.sessionId);
			return {
				...this.ctx.sandboxPolicy.resolve(live === void 0 ? {} : { session: live }),
				workspaceRoot: workspaceFileScope.workspaceRoot
			};
		}
		/** Apply the page defaults and caps here, so the request never carries them implicitly. */
		resolvePage(range) {
			const offset = range.offset === void 0 ? 1 : integerAtLeast(range.offset, 1, "offset");
			const limit = range.limit === void 0 ? this.config.maxLines : integerAtLeast(range.limit, 1, "limit");
			if (limit > this.config.maxLines) throw new RemoteError("gateway/bad-request", `limit must be at most ${this.config.maxLines}`, {});
			return {
				offset,
				limit
			};
		}
		/** Apply the byte-window defaults and cap; a window above the cap is refused, not shortened. */
		resolveWindow(range, path) {
			const offset = range.offset === void 0 ? 0 : integerAtLeast(range.offset, 0, "offset");
			const length = range.length === void 0 ? this.config.maxBytes : integerAtLeast(range.length, 1, "length");
			if (offset + length > Number.MAX_SAFE_INTEGER) throw new RemoteError("gateway/bad-request", "offset plus length must stay a safe integer", {});
			if (length > this.config.maxBytes) throw new RemoteError("workspace-file/too-large", `${length} bytes of "${path}" exceed the ${this.config.maxBytes} byte cap`, {
				path,
				limit: this.config.maxBytes
			});
			return {
				offset,
				length
			};
		}
		/**
		* Inspect the requested path itself before resolution follows its final
		* component. Containment is checked separately by the entry mutations.
		*/
		async inspect(workspaceFileScope, path, signal) {
			if (path.length === 0) throw new RemoteError("gateway/bad-request", "path is required", {});
			const { workspaceRoot } = workspaceFileScope;
			const root = await this.ctx.fs.resolve(workspaceRoot, { signal });
			const entry = await this.ctx.fs.lstat(path, { cwd: workspaceRoot }, signal);
			if (entry === void 0) throw new RemoteError("workspace-file/not-found", `no entry at "${path}"`, { path });
			return {
				root,
				workspaceRoot,
				entry
			};
		}
		/** Resolve an inspected path and refuse it unless the workspace contains it. */
		async confine(root, workspaceRoot, path, signal) {
			const target = await this.ctx.fs.resolve(path, {
				cwd: workspaceRoot,
				signal
			});
			if (!this.ctx.fs.contains(root, target)) throw new RemoteError("workspace-file/outside-workspace", `"${path}" is outside the workspace`, { path });
			return target;
		}
		/** Resolve and confine the parent while preserving the final entry, including a dangling symlink. */
		async entryPath(root, workspaceRoot, path, signal) {
			const paths = processPathsFor(workspaceRoot);
			const requested = paths.resolve(workspaceRoot, path);
			const parent = await this.ctx.fs.resolve(paths.dirname(requested), {
				cwd: workspaceRoot,
				signal
			});
			const absolute = paths.join(this.ctx.fs.processPath(parent), paths.basename(requested));
			const isRoot = paths.relative(this.ctx.fs.processPath(root), absolute) === "";
			if (!isRoot && !this.ctx.fs.contains(root, parent)) throw new RemoteError("workspace-file/outside-workspace", `"${path}" is outside the workspace`, { path });
			return {
				absolute,
				isRoot
			};
		}
		/**
		* The listed directory's workspace path when the workspace root contains it,
		* and its absolute path otherwise, so a listing outside the root stays
		* addressable.
		*/
		listingPathOf(root, target) {
			return this.ctx.fs.contains(root, target) ? workspacePathOf(this.ctx.fs.fileUrl(root), this.ctx.fs.fileUrl(target)) : this.ctx.fs.processPath(target);
		}
		/**
		* Run one bounded `git log` for a file and parse it. Every failure that is
		* not caller cancellation reports an empty history: a directory outside a
		* repository, a path git never committed, and a missing git executable are
		* ordinary answers for a timeline, not service failures.
		* @param directory - the file's directory, used as both the working directory and the `-C` argument.
		* @param name - the file's basename, the pathspec after `--`.
		* @param signal - caller cancellation; an abort propagates instead of reporting an empty history.
		* @returns the parsed commits, newest first.
		*/
		async gitLog(directory, name, signal) {
			let handle;
			try {
				handle = this.ctx.subprocess.spawn({
					argv: [
						"git",
						"-C",
						directory,
						"log",
						"--follow",
						"-n",
						String(GIT_LOG_LIMIT),
						"--date=iso-strict",
						`--format=${GIT_LOG_FORMAT}`,
						"--numstat",
						"--",
						name
					],
					cwd: directory,
					stdio: {
						stdin: "ignore",
						stdout: { maxBytes: GIT_LOG_MAX_BYTES },
						stderr: { maxBytes: GIT_LOG_STDERR_MAX_BYTES }
					},
					graceMs: GIT_LOG_GRACE_MS,
					signal
				});
			} catch (error) {
				if (signal.aborted) throw error;
				return [];
			}
			let outcome;
			try {
				outcome = await handle.done;
			} catch (error) {
				if (signal.aborted) throw error;
				return [];
			}
			if (signal.aborted) throw signal.reason;
			const stdout = handle.collected.stdout?.readFrom(0);
			if (outcome.exitCode !== 0 || stdout === void 0 || stdout.lossy) return [];
			return parseGitLog(stdout.text);
		}
		/**
		* All gates for a regular file, ending in the one stat that names its version
		* and size. The stat re-checks what `lstat` saw: the file may have gone or
		* changed kind in between.
		*/
		async locateFile(workspaceFileScope, path, signal) {
			const { workspaceRoot, entry } = await this.inspect(workspaceFileScope, path, signal);
			if (entry.type !== "file") throw new RemoteError("workspace-file/not-regular-file", `"${path}" is a ${entry.type}`, {
				path,
				kind: entry.type
			});
			const target = await this.ctx.fs.resolve(path, {
				cwd: workspaceRoot,
				signal
			});
			const info = await this.ctx.fs.stat(target, signal);
			if (info === void 0) throw new RemoteError("workspace-file/not-found", `no entry at "${path}"`, { path });
			if (info.type !== "file") throw new RemoteError("workspace-file/not-regular-file", `"${path}" is a ${info.type}`, {
				path,
				kind: info.type
			});
			return {
				target,
				info
			};
		}
		statOf(target, info) {
			return {
				absolutePath: this.ctx.fs.processPath(target),
				version: info.version,
				...info.size === void 0 ? {} : { bytes: info.size }
			};
		}
		/** Stream the file as text and cut the page, classifying the backend's non-text refusal. */
		async cutPage(target, offset, limit, signal, path) {
			try {
				return await cutPage(await this.ctx.fs.streamText(target, signal), offset, limit, this.config.maxBytes, path);
			} catch (error) {
				if (isNotTextRefusal(error)) throw new RemoteError("workspace-file/not-text", `"${path}" is not UTF-8 text`, { path }, { cause: error });
				throw error;
			}
		}
		/**
		* Answer one browser download request: `GET` streams the file, `HEAD` answers
		* the same headers for the client's preflight, and a refusal is a status
		* rather than a body. The file is located exactly as a Remote read locates it
		* — `ctx.fs` access rules included, so a file outside the workspace is
		* downloadable whenever it is readable — and carries no size cap of its own.
		* @param request - the `/api/workspace.download` request.
		* @returns the file's bytes, its preflight headers, or the refusal's status.
		*/
		async download(request) {
			const url = new URL(request.url);
			const sessionId = url.searchParams.get("sessionId");
			const path = url.searchParams.get("path");
			if (sessionId === null || sessionId.length === 0 || path === null || path.length === 0) return new Response("sessionId and path are required", {
				status: 400,
				headers: DOWNLOAD_HEADERS
			});
			const scope = await this.resolveScope(sessionId);
			if (scope === void 0) return new Response("session not found", {
				status: 404,
				headers: DOWNLOAD_HEADERS
			});
			try {
				const { target, info } = await this.locateFile(scope, path, request.signal);
				const absolute = this.ctx.fs.processPath(target);
				const headers = {
					...DOWNLOAD_HEADERS,
					"content-disposition": contentDisposition(processPathsFor(absolute).basename(absolute))
				};
				if (info.size !== void 0) headers["content-length"] = String(info.size);
				if (request.method === "HEAD") return new Response(null, { headers });
				return new Response(this.streamFile(target, info.size, request.signal), { headers });
			} catch (error) {
				const status = downloadStatus(fsCodeOf(error));
				return new Response(request.method === "HEAD" ? null : `download refused with status ${status}`, {
					status,
					headers: DOWNLOAD_HEADERS
				});
			}
		}
		/** Enumerate one regular file's bytes in windows no larger than one configured byte cap. */
		streamFile(target, size, signal) {
			return byteStream((offset, length) => this.ctx.fs.readByteRange(target, {
				offset,
				length
			}, signal), size, this.config.maxBytes);
		}
	};
})();
/**
* The `code` one thrown error carries, when it carries one, whatever its type.
* The error class belongs to whichever `dsh-fs` instance the provider loaded,
* so no class identity is shared across the package boundary; callers compare
* the value against the codes they know.
* @param error - any value a filesystem call rejected with.
* @returns the carried code, or `undefined` when the value carries none.
*/
function fsCodeOf(error) {
	if (typeof error !== "object" || error === null || !("code" in error)) return void 0;
	return error.code;
}
/**
* Translate one refused write into this namespace's error vocabulary. A stale
* version and a policy denial are the two a reader can act on, so each gets a
* code of its own; everything else travels as the backend raised it.
* @param error - the rejection from `writeText`.
* @param path - the requested path, carried in the failure details.
* @returns the error to throw in its place.
*/
function writeRefusal(error, path) {
	switch (fsCodeOf(error)) {
		case "FS_STALE_VERSION": return new RemoteError("workspace-file/stale", `"${path}" changed since it was read`, { path }, { cause: error });
		case "FS_SANDBOX_DENIED":
		case "FS_PERMISSION_DENIED": return new RemoteError("workspace-file/denied", `writing "${path}" is not permitted`, { path }, { cause: error });
		case "FS_NOT_REGULAR_FILE": return new RemoteError("workspace-file/not-regular-file", `"${path}" is not a regular file`, {
			path,
			kind: "other"
		});
		default: return error;
	}
}
/**
* Translate one refused upload into this namespace's error vocabulary: a name
* already taken and the two `write` share, plus everything else as raised.
* @param error - the rejection from `writeBytes`.
* @param path - the requested path, carried in the failure details.
* @returns the error to throw in its place.
*/
function uploadRefusal(error, path) {
	if (fsCodeOf(error) === "FS_NOT_OBSERVED") return new RemoteError("workspace-file/exists", `"${path}" already exists`, { path }, { cause: error });
	return writeRefusal(error, path);
}
/**
* The backend's non-text refusal, recognized by its code alone: the error class
* belongs to whichever `dsh-fs` instance the provider loaded, so no class
* identity is shared across the package boundary.
*/
function isNotTextRefusal(error) {
	return fsCodeOf(error) === "FS_NOT_TEXT";
}
//#endregion
export { WorkspaceFiles, WorkspaceFiles as default, parseGitLog };
