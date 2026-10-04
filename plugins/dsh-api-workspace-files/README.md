---
description: "Workspace file service for the web GUI: bounded file reads through the composed filesystem, directory listing anywhere the backend reaches, workspace-confined rename, move, and removal, version-guarded text replacement, byte uploads of new files, browser downloads that stream a whole file, per-file git history, and instrumented filesystem observation inside the Session workspace root."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-files

English | [中文](README.zh.md)

## Summary

Preview files readable through a Session's filesystem from the web client: UTF-8 text by page, bounded byte windows or complete files, related files, and metadata. Reads and listings may target any path the backend reaches. `rename`, `move`, and `delete` are confined to the Session workspace root; `write` and `upload` go through the composed filesystem under that backend's write policy; `history` reports a file's git log. One read leaves the Remote face: the browser download route streams a whole file over the authenticated `/api` carrier, past the `maxFileBytes` cap on one Remote answer. Instrumented observations stay workspace-scoped.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package beside `dsh-fs`, `dsh-sandbox-policy`, the Session store, the subprocess provider, and the Typert Gateway; the bundle does so right after the Session Controller. Every method takes the Session identity on the wire, so a Client calls `remote.workspaceFiles.read(sessionId, path, range, signal)`, `stat(sessionId, path, signal)`, `readBytes(sessionId, path, range, signal)`, `list(sessionId, path, signal)`, `rename(sessionId, path, newName, signal)`, `move(sessionId, paths, destination, signal)`, `delete(sessionId, path, signal)`, `history(sessionId, path, signal)`, or `changes(sessionId, signal)` and never names a root itself. The Host reads a live Session header or uses persistence `stat` for a cold Session; it does not activate an Agent, read the event body, or borrow a parent Session's root. Session persistence is optional for live reads, but without it a cold Session cannot resolve and the Gateway returns `gateway/lookup-not-found`.

| Method | Returns | Purpose |
|---|---|---|
| `stat(path)` | `WorkspaceFileStat { absolutePath, version, bytes? }` | Identity, version, and size of one regular file, without content |
| `read(path, { offset?, limit? })` | `WorkspaceFileText` = stat + `{ offset, text, lines, eof }` | One window of lines from a UTF-8 text file; `lines` counts them, so one empty line and a page past the end read differently |
| `readBytes(path, { offset?, length? })` | `WorkspaceFileBytes` = stat + `{ offset, data, eof }` | One window of raw bytes from any regular file, base64-encoded |
| `readAll(path)` | `WorkspaceFileBytes` with `offset: 0`, `eof: true` | Complete raw bytes under `maxFileBytes`; oversized files fail instead of being truncated |
| `readRelated(path, relativePath)` | `WorkspaceFileBytes` | Complete bytes of a file resolved from the base file's directory on the Host |
| `list(path)` | `WorkspaceDirectoryListing { path, entries, truncated }` | Direct children of one directory, anywhere the backend reaches |
| `rename(path, newName)` | `WorkspaceFileMutation { absolutePath }` | Rename one entry to a new name in the same workspace directory |
| `move(paths, destination)` | `WorkspaceFileMoves { destination, entries }` | Move entries into another workspace directory under their own names |
| `delete(path)` | `WorkspaceFileMutation { absolutePath }` | Permanently delete one workspace entry, a directory with everything below it included |
| `write(path, text, version)` | `WorkspaceFileStat` | Replace one regular file's whole text, guarded by the version the caller read |
| `upload(path, data)` | `WorkspaceFileStat` | Create one new file from exact bytes, never replacing an existing one |
| `history(path)` | `WorkspaceFileHistory { path, entries }` | One file's git commits, newest first; empty when git reports none |
| `changes()` | stream of `WorkspaceFileWatchFrame` | Subscription readiness, then filesystem observations inside the workspace root |

### Addressing and paths

`read`, `readBytes`, `readAll`, `readRelated`, `stat`, `list`, `rename`, `move`, `delete`, `write`, `upload`, and `history` accept an absolute path or one relative to the selected Session's workspace root. The composed filesystem decides whether a path is readable; the service imposes no workspace containment on reads, listings, or `history`. `readRelated` resolves a relative filesystem path from the base file's directory, including when either file is outside the workspace. These methods report the file's absolute path in the filesystem's execution world. `list` reports a directory inside the root as a workspace path and one outside it as its absolute path. `rename`, `move`, and `delete` are the exception: each refuses an entry whose resolved directory, or whose destination, leaves the workspace root with `workspace-file/outside-workspace`. `write` and `upload` carry no containment rule of their own; the composed filesystem's write policy is the fence, and it is applied to the Session the scope names. `changes` reports only instrumented filesystem observations inside the workspace root.

### Mutations

`rename(path, newName)` changes the entry's name without moving it: `newName` must be one path segment, non-empty and unpadded, without `/`, `\`, or NUL, and neither `.` nor `..`; anything else is a `gateway/bad-request`. Its parent directory, resolved through the filesystem, must stay inside the workspace root. The answer is the entry's new absolute path.

`move(paths, destination)` moves one or more entries into another workspace directory, each keeping its own name. `destination` is an absolute path or one relative to the workspace root, and must resolve to an existing directory — a file there is `workspace-file/not-directory`. Every requested entry's parent must resolve inside the workspace root, and so must the destination; an entry asked to move into itself or into its own subtree, and the workspace root itself, are `gateway/bad-request`. **The whole request is validated before the first entry moves**, so a refusal leaves every requested entry where it was: a destination name already taken, or two requested entries that would land on one name, is `workspace-file/exists` and nothing moves. An entry already in the destination directory is left alone and reported at its own path, which is what makes dropping a row back onto the directory it came from a no-op rather than an error. The answer names the destination's absolute path — the one directory a caller must list again to see the entries — and one `{ from, absolutePath }` per requested path, in request order.

`delete(path)` deletes the entry permanently: a regular file, a symlink, or a directory with everything below it. It refuses the workspace root itself with `gateway/bad-request` and any entry whose resolved parent leaves the workspace root with `workspace-file/outside-workspace`; a missing path is `workspace-file/not-found`. The answer is the removed entry's absolute path. `rename`, `move`, and `delete` resolve and confine the parent directory while preserving the final entry: a symlink or Windows junction is renamed, moved, or unlinked without modifying its target, including when the target is missing or outside the workspace.

`write(path, text, version)` replaces one existing regular file's complete text. `version` is mandatory and is the version the caller read the file at — from `stat` or an earlier `read` — so a file that changed since then is refused rather than overwritten; an empty `version` is a `gateway/bad-request`. The write runs through `ctx.fs` with the policy the Session resolves to, so a `read-only` Session refuses every write with `workspace-file/denied`, and `workspace-write` accepts only a target under that Session's workspace root. A file that is gone is `workspace-file/not-found`, and text above `maxFileBytes` is `workspace-file/too-large`. The answer is the file's metadata after the write, and its `version` is the new baseline for the next write. Bytes are stored as given: line-ending conversion belongs to the caller, which is why the Sidebar editor restores the style it read.

`upload(path, data)` creates one file from exact bytes — the file manager's upload, where a reader drops a file from their own machine into a workspace directory. `data` is the file's complete contents base64-encoded, and it must be canonical padded base64: a payload that only loosely decodes would be stored as something other than what the caller sent, so anything else is a `gateway/bad-request`. The path's last segment must be a usable file name, and the write always carries `createIfAbsent`, so an upload never replaces a file the caller has not read: a name already taken is `workspace-file/exists`. Text above `maxFileBytes` is `workspace-file/too-large` and creates nothing. The answer is the created file's metadata, exactly as `write` answers, so a reader can page the file immediately. Its policy fence is `write`'s: a `read-only` Session refuses every upload, and `workspace-write` accepts only a target under that Session's workspace root.

### Browser downloads

One read does not travel through the Remote face. `GET /api/workspace.download?sessionId=<id>&path=<path>` streams one regular file to the browser as `application/octet-stream` with a `Content-Disposition: attachment` naming the file, so a download is bounded by no complete-file cap: the handler reads the file through `ctx.fs` one `maxBytes` window at a time and enumerates them into the response, and neither end ever holds the whole file. `HEAD` answers the same headers with no body, which is how a client turns a refusal into a message instead of a saved error page.

The route is registered on the connection's exact-route registry under `/api`, so the carrier's Host/Origin fence and browser authentication run before the handler; it exists only where a Web runtime mounts `connection`, and the Mount section above is unchanged for every other deployment. `path` accepts the same absolute or workspace-relative vocabulary as a Remote read, and `sessionId` is resolved through the same lookup: a Session the Host has no header for is a `404`. The bytes come from `ctx.fs` under that backend's read authority, exactly as `readAll` reads them, so a file outside the workspace root is downloadable whenever it is readable.

### History

`history(path)` runs `git log --follow -n 50 --date=iso-strict --format=… --numstat -- <basename>` in the file's directory through the subprocess seam and parses the records. Each entry carries `hash`, `shortHash`, `author`, an ISO-8601 `date`, `subject`, and the `additions`/`deletions` git reports for that commit; a binary change reports `0` for both counts. The file may be inside or outside the workspace. A directory that is not a repository, a file git never committed, and a missing git executable all return `{ path, entries: [] }` instead of failing; caller cancellation still propagates.

### Pages

`read` returns one line window, never the whole file. `range.offset` is the 1-based first line and defaults to 1; `range.limit` is the largest number of lines on the page and defaults to `maxLines`, which it may not exceed — a larger limit, or an offset or limit that is not a positive integer, is a `gateway/bad-request`. Lines end at `\n`, and a final `\n` terminates the last line rather than starting an empty one, so a two-line file has two lines. The page's `text` joins its lines with `\n` and carries no terminator after the last; `eof` is true when the page includes the file's last line, and an offset past the end returns an empty page with `eof` true. Every page also carries the file's `version` from the stat that preceded it, so a consumer can tell a fresh page from a stale one, and `bytes`, the complete file's size when the backend reports it. The service reads the file only up to the first character past the page, so a very large file costs one page of memory per request.

### Byte windows

`read` pages by lines and never by bytes; a byte window is `readBytes`. `range.offset` is the 0-based first byte and defaults to 0; `range.length` is the largest number of bytes in the window and defaults to `maxBytes`, which it may not exceed — a longer window fails with `too-large` instead of arriving shortened, and an offset or length that is not an integer in range is a `gateway/bad-request`. The window comes back as base64 `data`, shorter than `length` at the end of the file and empty at or past it; `eof` is true when the window includes the file's last byte. Nothing is decoded and nothing is refused as binary, so an image or a NUL-laden file reads where `read` fails with `not-text`. The same `version` and `bytes` ride along as on a page.

### File-read and directory checks

Reads and listings use `lstat` to reject a missing path, a final symlink, or the wrong file kind. File operations then resolve and read through the composed filesystem without an additional workspace-containment check, and `list` lists any directory it resolves. Only `rename`, `move`, and `delete` add a containment check, on the resolved parent directory and any destination. The configured page, window, complete-file, and listing caps still apply. Text pages additionally reject invalid UTF-8 and NUL bytes; byte reads do not decode content. An empty path is a `gateway/bad-request`.

### The change feed

`changes` is a `stream` Remote. A generation registers its observation queue and resolves the Session workspace root before yielding `{ kind: 'ready' }`. It then yields `{ kind: 'change', change }`, where `change` is `{ absolutePath, version }` for a present file or `{ absolutePath, absent: true }` for one observed gone. The source is `fs/observed`, filtered to targets inside that root; the operating system is not watched. Observations after the generation's first pull are queued, including while the root resolves. The generation ends on cancellation or plugin disposal.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `maxBytes` | `2097152` (2 MiB) | Inclusive byte cap on one page's text and on one byte window; a larger page or window fails, and the browser download route reads one window of this size at a time |
| `maxFileBytes` | `33554432` (32 MiB) | Inclusive complete-file cap for `readAll` and `readRelated`; larger files fail with `too-large` |
| `maxLines` | `5000` | Default and largest page size in lines; a larger `limit` is refused |
| `maxEntries` | `2000` | Cap on returned directory entries; the rest is dropped and reported cut |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-workspace-files) is the exhaustive source for every accepted field and its JSDoc.

### Failures

Each failure is one `RemoteError` code with typed details, declared in [`src/types.ts`](src/types.ts): `workspace-file/not-found`, `workspace-file/outside-workspace` (`rename` and `delete` only), `workspace-file/too-large` (with `limit`, the applicable page, window, or complete-file cap), `workspace-file/not-text`, `workspace-file/not-regular-file` (`kind`: `directory`, `symlink`, or `other`), `workspace-file/not-directory` (`kind`: `file`, `symlink`, or `other`), plus three refusals only a mutation produces: `workspace-file/stale` for a file that changed since it was read, `workspace-file/denied` for a path the filesystem's write policy will not accept, and `workspace-file/exists` for an upload or a move whose destination name is already taken. Callers branch on the code, never on message text. The browser download route answers with HTTP statuses instead: `400` for a malformed query, `404` for an unknown Session or a missing file, `403` for a path that is not a regular file or lies outside the workspace, and `500` otherwise — never with a Host path in the body.

### Client file resources

The browser export registers the `file` provider into `ctx.resources` and requires `resources`, `remote`, and `remote.workspaceFiles`. The bundle's single `workspace-files` row supplies both faces; the Client has no separate configuration. A component reads `WorkspaceFileStat { absolutePath, version, bytes? }` metadata through `useResource<'file'>(address)` and fetches content separately through Remote reads. Any UI, including Global components, shares the observation for the same complete address.

A `session/<sessionId>/<path>` address carries the authorizing Session and a relative or absolute path; leading slashes are preserved, as in `dsh-resource://file/session/s//etc/hosts`. The Host receives the path unchanged and owns resolution and access checks; the Client needs no Session `cwd`. `absolute/<path>` remains parseable but has no authorizing Session and fails with `workspace-file/unknown-workspace`, without borrowing current or Tab Session. Unsupported addresses fail with `workspace-file/unsupported-address`. [Workspace-path](../../util/workspace-path/README.md) owns the grammar; the generic Resource layer knows only the address and `signal`.

The provider waits for the Host's `ready` frame before its first `stat`, queues changes during the read, then binds the follower to `stat.absolutePath`. Both queued and live changes match that Host-returned path. A new write version updates metadata while retaining the last byte size; duplicate versions are ignored. An absent notice re-stats the file. A failed stat keeps the address followed; a later write can recover it, and any Session write can trigger a retry before the first successful path binding. Frames are `RemoteResult` values, and programming exceptions remain uncaught.

One supervised `changes` stream serves every followed file in a Session. Followers match absolute paths with backslashes normalized to slashes. Carrier loss reconnects through the Gateway supervisor; a Host-ended or terminally failed feed ends its followers and leaves their last metadata readable until reopened. The last follower leaving disposes the stream, a successor waits for that disposal, and plugin teardown awaits all pending closes. The provider declares `ResourceProtocolMap.file`; the text preview declares its Sidebar line-navigation parameters.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

Reads through `ctx.fs` use the backend's read authority, and the sandboxing backend fences writes, byte writes, and edits rather than reads; that asymmetry is why `write` and `upload` are policy-checked and every read is not. A Typert lookup derives `WorkspaceFileScope` from a live Session header or the persistence service's header-only `stat`, so cold subagent Sessions need neither Agent activation nor event-body reads. The service adds regular-file checks and bounded transfer; workspace containment belongs only to `rename` and `delete`, which call `node:fs` because the `ctx.fs` seam exposes neither operation, while change observation keeps its own root filter. `history` runs `git log` through the subprocess seam. A page is cut from `streamText`, which decodes and rejects non-UTF-8 chunk by chunk: the cutter counts lines before the window without keeping them, admits each in-window segment against the byte cap before buffering it, and returns at the first character past the window. One `stat` before the stream names the version and size the page reports.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceFiles`: the `workspaceFiles` service and Remote namespace, `Config`, the gates, the page cutter, `parseGitLog`, `writeRefusal`, `uploadRefusal`, `resolveScope`, `read`, `readBytes`, `readAll`, `readRelated`, `stat`, `list`, `rename`, `move`, `delete`, `write`, `upload`, `history`, and the `/api/workspace.download` route |
| [`src/download.ts`](src/download.ts) | The browser download route: its path and headers, the `Content-Disposition` value, and the pull-driven byte stream |
| [`src/changes.ts`](src/changes.ts) | `WorkspaceChangeFeed`: `fs/observed` subscription and one queue per open `changes` generation |
| [`src/types.ts`](src/types.ts) | Wire types and the `RemoteErrorDetailsMap` codes, published as `./types` for Client packages |
| [`src/client/index.ts`](src/client/index.ts), [`provider.ts`](src/client/provider.ts), [`change-feed.ts`](src/client/change-feed.ts) | Browser plugin, file metadata, and per-Session change feed |
| [`src/client/types.ts`](src/client/types.ts), [`remote.ts`](src/client/remote.ts) | Resource values, parameters, Client error codes, and generated Remote types |
| — | No runtime invariant companion is published; every Host answer is derived from `ctx.fs` and the sandbox policy at call time. |

Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Filesystem capability](../../fs/fs/README.md) — the `ctx.fs` contract this service reads through, including `fs/observed` and `readByteRange`.
- [Sandbox policy](../../sandbox/sandbox-policy/README.md) — where the Session's workspace root comes from.
- [Remote assembly](../../api/remotes/README.md) — how Client packages reach the `workspaceFiles` namespace.
- [Client resources](../../client/resources/README.md) — the resource model, `useResource`, pins, and provider lifetime.
- [Workspace path helpers](../../util/workspace-path/README.md) — `fileAddressFor` and `parseFileAddress`, the `dsh-resource://file/…` address grammar both ends share.
- [Sidebar text preview](../../client/ui-sidebar-documentpreview/README.md) — the tab type that follows a file through the `file` provider and reads its pages.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **A download is one request per file** — the browser route streams one file per URL, so downloading a selection means one request and one browser save per file. A browser that treats several programmatic downloads as a pop-up asks the reader to allow them once; a single archive over the selection is deferred work.
- **The download route is Web-only** — it is registered on the connection carrier, so a runtime without one (a non-Web profile, headless) has every Remote read and no browser download.
- **A move is not a transaction** — the whole request is validated before the first entry moves, so a refusal moves nothing, but a rename that fails midway (a concurrent writer, a permission change) leaves the entries before it relocated. The caller lists the source directories and the destination again either way.
- **Instrumented operations only** — `changes` relays `fs/observed` emissions; a file changed by a subprocess, a shell command, or the user's editor produces no frame.
- **Change observation stays workspace-scoped** — `changes` filters to the Session workspace root even though reads, listings, and `history` may use any path the filesystem backend reaches.
- **Mutations bypass the filesystem seam** — `rename` and `delete` call `node:fs` because `ctx.fs` exposes no rename or remove operation, so a sandboxing or remote backend's write rules do not apply to them; each method keeps its own `ctx.fs` containment check against the Session workspace root. `write` takes the other route and is the only mutation the backend's policy fences, which also makes it the only one a `read-only` Session refuses.
- **`write` creates nothing and moves nothing** — the target must already exist as a regular file, and the write always presents a version guard, so there is no way to create a file or to overwrite one the caller has not read. Creating is `upload`'s job, and neither moves anything.
- **An upload never replaces** — the byte write always guards with `createIfAbsent`, so putting a file where one already sits is refused rather than resolved by overwriting; a reader who wants the new bytes there deletes or renames the old file first.
- **`write` answers with metadata only** — the result carries the file's new version and byte size, not the content before or after the write, so a caller that wants a diff basis reads the file again rather than reusing what it already sent.
- **History shells out to git** — `history` returns an empty history on every non-zero exit, so a machine without `git`, a directory outside a repository, and a file git never committed are indistinguishable from one another.
- **No total line count** — a page reports `eof`, not how many lines follow; a consumer that needs the total pages to the end or estimates from `bytes`.
- **One giant line has no page** — a single line above `maxBytes` fails `too-large` at every window that includes it, because pages are cut by lines, not bytes.
- **Reads are not transactional** — result metadata comes from stat before content is read; a concurrent write can make the reported version and returned contents differ.
- **Unbounded generation queue** — a `changes` generation buffers every contained observation until its consumer pulls; a stalled consumer grows Host memory for the life of the stream.
- **`maxEntries` bounds the answer, not the listing** — `list` asks `ctx.fs.listDir` for every child and cuts the array afterwards, so a directory far above the cap still costs the Host the whole listing (on `fs-local`, one stat per child); bounding that work needs a limit on the filesystem seam's `listDir`.
- **Dead feeds retain metadata** — after the Host ends `changes` or the stream fails terminally, open values retain their last state until reopened.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
