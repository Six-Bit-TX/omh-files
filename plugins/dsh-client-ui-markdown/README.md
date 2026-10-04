# @local/dsh-client-ui-markdown

English | [中文](README.zh.md)

In-place Markdown editing as a right-Sidebar tab in the dsh Web GUI: `.md` and `.markdown` session files open in a rendered editor (the Muya kernel MarkText uses) with a source-mode escape hatch, a version-guarded save, and a per-file round-trip gate that keeps the editor from reformatting files it cannot serialize back byte-for-byte.

Companion documents: [`../../docs/dsh-markdown-editor.md`](../../docs/dsh-markdown-editor.md) carries the design, the engine survey, and the honest limits.

## Layout

| Path | Role |
|---|---|
| `index.js` | Host half: mirrors the engine package under two authenticated `/api` spaces (see below). Empty of business logic otherwise. |
| `client.js` | Browser half: the `markdown` tab type, the pane, the gate, the guarded save. Hand-written `window.__ModuleLoader__.load` bundle; its only externals are `react` and `ui-primitives`. |
| `vendor/muya-core/` | The pinned engine (`@muyajs/core@0.2.0`), materialized by `install.sh`. Not versioned here — 13 MB of published artifacts belong in the profile. |
| `tools/host-check.mjs` | Dry run of the host half: composes it against a recording context and asks the mirrored spaces what a browser asks. |
| `tools/roundtrip.mjs` | The round-trip gate, run over a corpus instead of one file. This is the evidence behind the pane's behavior. |

## Why two `/api` spaces, and why the host half exists at all

`@muyajs/core` ships a browser ES-module graph. Its entry imports sibling chunks by relative path, imports 47 PNG icons **as modules** (which a browser cannot execute), and its stylesheet references 81 fonts and icons beside it. Connection's shared channel answers exact routes only, with no wildcard, so the host half walks the package's `lib/` once and registers one exact route per file:

- `/api/muya/…` — the **module space**: JavaScript and CSS as themselves, and an icon as a one-line ES module exporting the URL it is fetched from.
- `/api/muya-asset/…` — the **byte space**: what a stylesheet `url(…)` or an `<img>` fetches. The engine stylesheet is rewritten on the way out so its relative references land here.

935 routes, all cookie-authenticated, nothing outside the package's `lib/` reachable, and a missing engine answered by one explanatory `/api/muya/status`.

## The gate (what "safe" means here)

The engine's serializer canonicalizes some constructs, so the pane serializes each file on open and compares it with the bytes on disk:

| Result | Behavior |
|---|---|
| Byte-identical | Opens in rendered mode. |
| Differs | Opens in **source mode** with the reason stated, plus a button to open in rendered mode anyway; a save from there reports how many lines it would change. |
| Engine unavailable | Source mode still edits and saves; the engine error is stated. |

Measured on this repository (3,451 `.md` files, `tools/roundtrip.mjs`):

```
2099  identical                (61%)
 758  content-changed          (mostly nested-list indentation: 4 spaces -> 2)
 275  table-padding            (cells padded to column width)
 132  paragraph-reflow
 102  table-padding + fence info string truncated (```ts ignore-check -> ```ts)
  72  lines-added
  12  unclassified-large
   1  trailing-newline
```

So the rendered mode is the default for the majority of real files, and the files it would rewrite are named rather than silently changed. Two further guards apply in every mode: a save with no recorded edit writes nothing at all, and every save carries the version the file was read at, so a file an agent wrote meanwhile is refused (`workspace-file/stale`) instead of overwritten.

A save acknowledges only the draft submitted with that request. Edits made while the write is pending remain in the editor and stay marked as unsaved; the next save uses the returned file version. Changing files or reloading invalidates pending completion handlers, so an earlier file's save cannot replace the current draft or its version.

Unsaved Markdown drafts persist in browser storage by Session and file, retaining the original text and file version. Reload and tab remount recover them in source mode, including when the file cannot currently be read. If the disk version changed, the pane shows the current text and withholds saving until the user merges the edits and explicitly accepts that version. Closing a dirty tab or discarding a draft asks for confirmation; browser navigation warns about any loaded unsaved draft. Browser storage is local to this origin and its quota; it is not a cross-device backup.

## Install and verify

```sh
cd overlay
./install.sh          # materializes the engine (once) and installs the rows
# then, because a new Loader row is composed only at host boot:
#   1. restart `dsh web`
#   2. refresh the page
```

```sh
# host half, without touching a running server
node overlay/plugins/dsh-client-ui-markdown/tools/host-check.mjs

# the gate over a corpus (argument-less walks the repository)
node overlay/plugins/dsh-client-ui-markdown/tools/roundtrip.mjs
node overlay/plugins/dsh-client-ui-markdown/tools/roundtrip.mjs README.md docs/architecture.md
```

The offline save regression uses the checkout's installed Web dependencies and Playwright Chromium: `node overlay/plugins/dsh-client-ui-markdown/tests/save.browser.mjs`. It exercises edits during a pending save, switching files before a write completes, and browser reload with a recovered draft and conflicting disk edit.

`roundtrip.mjs` drives the serializer, not the mounted editor: `Muya.init()` needs a real browser (`focus is not defined` under jsdom), while `getMarkdown()` is the code that decides the bytes, so the harness measures the part that matters. Its `MUYA_INIT=1` switch attempts the mounted path and reports the jsdom failure rather than hiding it.

## Licensing

The engine's code is MIT (`vendor/muya-core/LICENSE` travels with the vendored copy). Its fonts are not: KaTeX's fonts are SIL OFL 1.1, `@marktext/file-icons` carries FontAwesome (also OFL 1.1), DejaVu Sans Mono is under the Bitstream Vera license, and the npm tarball ships **no** OFL notice of its own. The vendored tree is not redistributed from this repository, but a build that ships these fonts onward must carry those notices. The pane's own styling uses the product's `--dsw-*` tokens and does not adopt the engine's 33 editor themes (several of which are named after commercial products).

## Not in this package (P1+)

Formatting toolbar and slash menu (`Muya.use(InlineFormatToolbar)` and friends, 17 plugins shipped by the engine), image paste into the workspace (`imageAction`/`imagePathPicker` hooks plus a host upload route), TOC (`getTOC()`), in-document search/replace (engine methods), code-mirror source mode instead of the textarea, and the model-side `markdown_read`/`markdown_edit` tools.
