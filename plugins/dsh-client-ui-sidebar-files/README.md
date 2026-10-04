---
description: "The right Sidebar's file-tree tab type for the dsh web client: the session workspace root listed one level at a time over the wire, with a multi-row selection a right-click downloads, moves, or deletes, opening files into the Sidebar by resource address."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-files

English | [中文](README.zh.md)

## Summary

The right Sidebar's navigator tab type: the session's workspace root as a tree, listed one level at a time over the wire, opening files into the Sidebar. It is a page type reached from the guide and claims no address; it opens files by address for the `dsh-resource://file` viewers to claim — nothing in `ui-sidebar-right` knows this package. Rows take part in a selection, and a right-click on it offers the entry-wide gestures: copy, download, move, and delete. Files the reader picks or drops from their own machine land in a directory of the tree through the Host's upload endpoint.

## Table of Contents

- [What it registers](#what-it-registers)
- [The tree](#the-tree)
- [Uploading](#uploading)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The type** — `ctx.sidebarRightTabs.register(...)` with kind `files`, id `@deepseek-ai/dsh-client-ui-sidebar-files`, band `builtin`, no patterns, and one guide entry (order 10, its title and description from the `sidebarFiles` namespace, its glyph the shared folder icon) that opens the type.
- **The body** — the keyed `sidebar.right.pane.tab` seat under that id: an address row under the strip, then the tree. The address row is the document preview's (`ui-sidebar-documentpreview`) path row plus two controls: the path itself is the address and edits in place (a click swaps in a text field seeded with the tab's root; Enter lists the typed address, Escape and blur put the display back), a folder button at its start opens the location menu, and reload sits at its end. The row is copied rather than shared because a plugin bundle shares runtime code only through the platform modules; once the artifact and slot surfaces settle, one copy in `ui-primitives` could serve every pane header.
- **The chip title** — the keyed `sidebar.right.pane.tab.title` seat under that id: a shared `FileTypeIcon` folder glyph at 16px before the type's label. The tree's own rows never draw this sheet.

Seventeen source files under `src/client/`: `definition.tsx` (the type), `store.ts` (what it keeps), `face.ts` (how it lists and mutates, Remote binding included), `FilesBody.tsx` (what it draws), `PathHeader.tsx` (the address row and its location menu), `EntryMenu.tsx` (the row menu), `RenameDialog.tsx`, `MoveDialog.tsx`, `DeleteDialog.tsx`, `CompareDialog.tsx`, `TimelineDialog.tsx` (the five dialogs), `selection.ts` (the drawn order, the selection gestures, and what a menu acts on), `drag.ts` (the payload a dragged row carries), `paths.ts` and `download.ts` (`/`-joined path helpers and the browser download), `upload.ts` (bytes in, base64 out), `failures.ts` (the failure lines), `FilesTitle.tsx` (the chip title), `locales.ts` (what it says), and `index.ts` (the wiring).

<a id="the-row-menu"></a>
## The row menu

A right-click opens the shared `Menu` primitive at the pointer, acting on the tab's selection: the row clicked when it is not part of one, and the whole selection when it is. The rows that answer for one entry — open (files only), select for compare, compare with the selected file (only while this tab holds a compare base), open timeline (files only), rename — appear for exactly one; the entry-wide rows — copy path, copy relative path (relative to the tab's root), download (when at least one file is selected), move, and delete — name and count whatever the menu acts on. Copy writes through the platform clipboard, one path per line; download hands the browser the Host's own streaming route, one request per selected file; move and delete open a dialog.

The selection is built with the gestures every file manager has: a plain click selects one row and still activates it (a directory toggles, a file opens), a Ctrl/Cmd click adds or removes a row without activating it, and a Shift click takes the range between the anchor — the row the last gesture touched — and the row clicked, in display order. A right-click on a row outside the selection moves the selection to it first. A move or a delete ends the selection, and re-rooting the tab does too.

Rename, move, and delete are the Host mutations the tab performs, and all three are confined to the session's workspace root: `workspaceFiles.rename`, `workspaceFiles.move`, and `workspaceFiles.delete` refuse a path whose directory leaves it. Rename opens a dialog that refuses a blank name, a name with `/` or `\`, and an unchanged name; delete opens a confirmation that names the entry, or counts a selection; move opens a dialog pre-filled with the tab's root that refuses a blank destination, and the same move runs on a drop, where a row dragged onto a directory row carries the whole selection. A move lists every directory that changed — the ones the entries left, and the one they landed in, whose absolute path only the Host knows.

Downloading is the one gesture that leaves the Remote face. The tab hands the browser `/api/workspace.download?sessionId=…&path=…`, the Host's authenticated route that streams the file while reading it one window at a time, so a file above the Remote's complete-file cap downloads like any other. Each file is preflighted with `HEAD` first, which turns a refusal — gone, not a regular file, an unknown session — into a notice line instead of a saved error page, and a selection is downloaded one file per request, in selection order. Compare reads one bounded page (2000 lines) of each side and renders the shared `DiffBlock`, noting a side the cap cut. Timeline lists the file's `git log` — up to 50 commits, newest first — and says so when git reports none; the path is not re-checked for a repository, so a file outside one simply has no history.

<a id="the-tree"></a>
## The tree

The root is the session's working directory, read from `useSessions().byId[sessionId].cwd`, and split for the address row by `pathPartsOf` from `@deepseek-ai/dsh-util-workspace-path`. The address edits in place, so the tab can be rooted anywhere the Host can list — including directories outside the session's workspace — and the location menu offers every Workspace the Client knows, the session's working directory, the Host account's home, and the directories this tab has visited, most recent first (capped at eight). A freshly opened tab always starts at the session's working directory. Every level is keyed by absolute path; a child's path is its parent's joined with the entry name by `/`. A level is listed when it is first expanded, through `remote.workspaceFiles.list(sessionId, absolutePath)` on the `@deepseek-ai/dsh-api-workspace-files` namespace; the adapter keeps the listing's entries and truncation flag and drops its workspace-relative path. Rows are ordered directories first, then by natural, case-insensitive name; dotfiles are shown like any other entry.

| Entry type | Row |
|---|---|
| `directory` | Toggles; the level is fetched the first time it opens and kept while collapsed. |
| `file` | Opens `dsh-resource://file/session/<sessionId>/<encoded path relative to the root>`, built by `fileAddressFor` from `@deepseek-ai/dsh-util-workspace-path` from the entry's absolute path and the tree's root, through `useTabInfo().tab.actions.openResource`, landing in the tab's own pane. |
| `other` | Shown greyed and not clickable, so the directory is reported whole. |

A level cut by the endpoint's entry cap ends with a marker; an empty level says so; a level that failed shows one line per code — `workspace-file/not-found`, `outside-workspace`, `not-directory` — and the transport's own message otherwise. Reload drops every listed level and asks again for the expanded ones; collapsed levels are fetched again when they next open. A session without a working directory shows a single line instead of a tree.

State lives in the type's own store, bucketed by tab id: `root`, `levels` (loading / ready / failed per absolute path), `expanded`, `scrollTop`, `recent` (this tab's visited directories), `compareBase` (the entry selected for comparison), `selected` (this tab's selection, in the order it was built), `anchor` (the row a Shift click extends from), and `uploads` (the files on their way in). The body tracks the scroll offset locally while scrolling and commits it once when it unmounts. Because the store outlives the body, switching to another sidebar tab and back remounts the tree with its levels intact, its scroll offset restored, and its compare base still selected. The owner's `signal` ends a bucket: on abort the tab is forgotten, and neither a listing that settles afterwards nor the unmount's offset commit writes anything.

<a id="uploading"></a>
## Uploading

Files come in from the reader's machine two ways: the upload control at the end of the address row opens the browser's picker, and a drop on the tree carries whatever the reader dragged from their desktop. Both name a directory — the tab's root for the picker and for a drop on the body's own background, and the directory under the pointer for a drop on a directory row, whose whole subtree counts as that directory. A transfer carrying this tree's own dragged rows is a move instead; the transfer's payload tells the two apart.

Each file is read whole, encoded as base64, and sent as one `remote.workspaceFiles.upload(sessionId, path, data)` call under the Host's complete-file cap, which is what makes an upload the mirror image of a download. Uploads for one tab run one at a time, in the order they were asked for: each holds a whole file in memory while it is in flight, so a selection of large files is bounded by sending them in sequence rather than together.

Every file holds a row under the header from the moment it is picked until the Host answers. A landed file leaves its row, and the directory that took it is opened if it was closed and listed again, so the new file is never hidden inside a collapsed level; a refused one keeps its row carrying the reason and a dismiss control. An upload never replaces: a name already taken comes back as `workspace-file/exists`, and putting the new bytes there is a separate decision — rename or delete the old entry first.

<a id="model-experience"></a>
## Model Experience

None, as this package draws a workspace file tree in the browser and registers nothing model-facing.

#### KV Cache effect

None; directory listings travel over the Remote and assemble no model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Workspace-confined mutations.** Rename, move, and delete refuse an entry whose directory — or whose destination, for a move — leaves the session's workspace root, even though listing and reading reach further; a cut/copy/paste pair, search, a current-file highlight, and filesystem watching are absent — a level changes only through reload, a mutation's own reload of the affected levels, or the navigation gesture.
- **A selection downloads one file at a time.** A browser that treats several programmatic downloads as a pop-up asks the reader to allow them once; one archive over the selection is deferred work, and a ZIP would belong to the Host route.
- **Selection is not pruned against a listing.** A path stays selected after the level that showed it is listed again without it, so a menu opened over such a selection acts on the rows that still resolve and falls back to its own row otherwise — nothing acts on a selection it cannot resolve in full.
- **A `file://` shell falls back to a capped read.** The streaming route exists only where a Web runtime mounts the connection carrier. A shell without one (the Electron composition, which serves no HTTP) downloads through the Remote face instead: the bytes arrive whole on the wire and under the Host's `maxFileBytes`, which is the limit this feature lifts for the Web GUI. Downloads on such a shell therefore keep the earlier behavior rather than failing.
- **The move dialog takes a typed path.** The destination is typed in the address bar's vocabulary rather than picked from a chooser: the Client has no directory picker of its own, and the drop gesture is the pointing-device route to the same move.
- **An upload is one whole file in memory.** The page reads the picked file whole and encodes it whole before sending it, so the Host's `maxFileBytes` is the cap that refuses it rather than a stream that bounds it; a selection is sent one file at a time for the same reason, and a refusal arrives after the reader's file has already been read.
- **An upload never replaces.** A name already taken is refused (`workspace-file/exists`) instead of resolved by overwriting, so a reader who wants the new bytes there renames or deletes the old entry first. There is no create-a-directory, no rename-on-upload, and no resume of an interrupted upload.
- **Listing, not a file manager.** Nothing here needs git, but the timeline verb reports whatever `git log` says for the file's directory, so a file outside a repository — or a host without git on `PATH` — has no history rather than an error.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The tree's only runtime state is one Slot store per tab, written by the body that owns it and forgotten on the tab's abort signal; there is no second observation of it to compare against.
