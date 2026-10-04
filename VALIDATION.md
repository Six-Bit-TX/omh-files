# Packaging validation

Date: 2026-10-04. Runtime API: OMH/DeepSeek Harness 0.1.6-alpha.1.

- **Passed:** `pnpm exec vitest run packages/api/workspace-files/tests packages/client/ui-sidebar-files/tests packages/client/ui-sidebar-documentpreview/tests packages/client/ui-sidebar-right/tests` in the source runtime — 80 files and 923 tests.
- **Passed:** all 92 harness source entries found in the four client sourcemaps matched the current owner source before export. Bundled outputs are newer than all files in their owner source directories.
- **Passed:** `npm run check:artifacts` — 1,355 artifact files and all seven export/client identity declarations.
- **Passed:** `npm run test:office` — 30 tests, including the authenticated proxy, save callback flow, stale writes, and symlink refusal.
- **Passed:** `npm run test:markdown` — 935 registered engine routes; all 14 asset/HEAD/CSS checks passed.
- **Passed:** workspace-file generated RPC registration and disposal smoke for the explicit path-mounted schema plugin.
- **Included:** runnable host/client bundles, generated Typert host and client descriptors, owner source/tests, complete Muya engine assets, and license notices.
- **Sanitized:** developer build paths in generated region comments and sourcemaps; no credentials or runtime state were copied.

Office browser integration requires a running local ONLYOFFICE container and Web profile. The Markdown browser save scenario also requires an authenticated Web profile. These environment-dependent browser tests were retained, but were not rerun during packaging. See the root install/check scripts for bundle composition checks.
