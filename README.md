# OMH Files

One Cordis bundle for the **Files and editing** category, covering OMH-01 through OMH-12. It includes runnable host and browser plugins, their source, and the Markdown engine assets.

## Features

- [x] **OMH-01** — File address bar, workspace/home switching, and recent locations.
- [x] **OMH-02** — Rename, delete, and copy file paths with workspace checks for mutations.
- [x] **OMH-03** — Multiple selection, range selection, moving, and batch deletion.
- [x] **OMH-04** — Upload from the file picker or desktop drag and drop without overwriting an existing filename.
- [x] **OMH-05** — Streaming downloads, including selected files.
- [x] **OMH-06** — Compare two text files, bounded to 2,000 lines per file.
- [x] **OMH-07** — File Git history and recent commit timeline.
- [x] **OMH-08** — Text/code editing, Save shortcuts, line-ending preservation, and version-guarded writes.
- [x] **OMH-09** — Muya rendered/source Markdown editing and round-trip checks.
- [x] **OMH-10** — Local ONLYOFFICE editing of DOCX, XLSX, and PPTX with backups and guarded saves.
- [x] **OMH-11** — Unsaved text/Markdown draft recovery and explicit conflict resolution.
- [x] **OMH-12** — Restore each task's sidebar tabs, splits, selection, and presentation after reload.

## Compatibility and installation

Requires an OMH/DeepSeek Harness **0.1.6-alpha.1** Web profile, Node **22.19+ or 24+**, and a runtime exposing the matching filesystem and Typert APIs. Other harness versions are not declared compatible. No npm publication is required: this repository is a local Cordis bundle.

```sh
git clone https://github.com/Six-Bit-TX/omh-files.git
cd omh-files
node scripts/install.mjs --profile "$HOME/.dsh/profiles/web" --runtime /path/to/omchor-harness
```

Save active work, restart the Web profile, and refresh the browser after installation. The installer adds `@omh/files` after the normal Web bundle. Keep this checkout in place while installed. Existing custom caps for the old `workspace-files` row should be restated on `omh-files-workspace-files` in the profile patch, because the replacement is a new row. Existing manually installed Markdown or Office rows must be removed or disabled to avoid loading the same owner twice.

This bundle supplies the persistent sidebar owner and close-handler API used by the other OMH sidebar bundles. Install it before the browser/media and ROS bag bundles when the base runtime lacks those OMH additions.

### Optional local Office service

The file browser, text editor, and Markdown editor work without a document server. Office editing requires a local Linux Docker engine and separately provisioned ONLYOFFICE Docs:

```sh
node plugins/dsh-client-ui-office/setup.mjs
```

Provisioning downloads the pinned upstream ONLYOFFICE image and starts its loopback service. It creates its own private configuration under `$DSH_HOME/office`, or `~/.dsh/office`, and does not read any credentials from this repository. See the [Office README](plugins/dsh-client-ui-office/README.md) for the supported formats, networking, backup, and save behavior. ONLYOFFICE is a separate product with its own license.

## Composition

| Loader row | Owning package | Purpose |
| --- | --- | --- |
| `omh-files-rpc-schemas` | `@omh/files-rpc-schemas` | Generated RPC schema registration for the replacement owner |
| `omh-files-workspace-files` | `@deepseek-ai/dsh-api-workspace-files` | File RPCs, upload/download, guarded mutations, and Git history |
| `omh-files-sidebar-right` | `@deepseek-ai/dsh-client-ui-sidebar-right` | Persistent task-bound docking surface and editor close guards |
| `omh-files-sidebar-files` | `@deepseek-ai/dsh-client-ui-sidebar-files` | File navigation and actions |
| `omh-files-documentpreview` | `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` | Preview and text/code editor |
| `omh-files-markdown` | `@local/dsh-client-ui-markdown` | Muya Markdown editor and engine routes |
| `omh-files-office` | `@local/dsh-client-ui-office` | ONLYOFFICE tab, authenticated proxy, and guarded save bridge |

The bundle disables the four original owner rows before inserting replacements. The package names remain stable so existing client injection declarations resolve to the replacement owners. These are full executable plugins, including generated Remote descriptors; installation does not apply source patches to the runtime.

Layout recovery restores layout only. It does not restore processes. Drafts use browser-local storage and preserve the version guard from the original read. File previews retain the configured read limits. Office editing follows its local regular-file and networking restrictions.

## Validation and maintenance

```sh
npm run check:artifacts
npm run test:office
npm run test:markdown
```

The packaging pass also ran the four upstream owner test directories: **80 test files, 923 tests passed**. These include workspace containment, symlink mutations, stale-version writes, upload/download, selection, editor drafts, and sidebar persistence. The [validation record](VALIDATION.md) distinguishes executed checks from environment-dependent browser tests.

The TypeScript owner sources are under each plugin's `src/`; existing owner tests are retained under `tests/`. Their compiler/test context is the matching harness source checkout. To change those owners, develop and build them with that checkout's toolchain, rerun their focused tests, and replace both source and `lib/` together. `check:artifacts` checks shipped package exports, client identities, and the integrity manifest. The root installation helpers validate composition separately.

## Licenses

Harness-derived code is MIT, copyright 2026 DeepSeek, with the original [license](LICENSE) retained. Muya includes its own license in `plugins/dsh-client-ui-markdown/vendor/muya-core/`. Bundled PDF.js, picomatch, and clsx notices are retained in [licenses](licenses). No sessions, workspaces, secrets, or Omchor branding overlay are included.
