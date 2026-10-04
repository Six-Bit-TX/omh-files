/**
 * Markdown editor engine assets, node half.
 *
 * The engine (`@muyajs/core`, the Muya kernel extracted from MarkText) ships as
 * a browser ES-module graph: its entry imports sibling chunks by relative path,
 * imports 47 PNG icons as modules, and its stylesheet references fonts and icons
 * beside it. A browser resolves all of that against the entry's own URL, so the
 * engine only loads if its published `lib/` tree is mirrored at one stable URL
 * prefix — and only if the module graph never hands the browser something it
 * cannot execute.
 *
 * Connection's shared `/api` channel answers exact routes only (no wildcard), so
 * this plugin walks the installed package's `lib/` once and registers two
 * mirrored, cookie-authenticated spaces:
 *
 * - `/api/muya/<path>` — the module space. JavaScript and CSS are served as
 *   themselves; an icon is served as a one-line ES module exporting the URL it
 *   is fetched from, because a browser cannot execute a PNG as a module.
 * - `/api/muya-asset/<path>` — the byte space, for what a stylesheet or an
 *   `<img>` fetches directly. The engine stylesheet is rewritten on the way out
 *   so its relative `url(…)` references land here.
 *
 * Files whose names a route segment cannot carry are skipped rather than
 * rewritten into a URL the engine would never ask for, and nothing outside the
 * package's own `lib/` directory is reachable.
 *
 * @module @local/dsh-client-ui-markdown
 */
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** URL prefix the engine's module graph is served under. */
const MODULE_PREFIX = "/api/muya";

/** URL prefix the engine's raw assets (fonts, icons) are served under. */
const ASSET_PREFIX = "/api/muya-asset";

/** URL the browser asks when it needs to know why the engine is unavailable. */
const STATUS_PATH = `${MODULE_PREFIX}/status`;

/** Extensions served as themselves in the module space; everything else is a URL-exporting shim. */
const MODULE_TYPES = new Set([".js", ".mjs", ".cjs", ".css", ".json"]);

/** Media types for every file kind the engine ships. */
const MEDIA_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8"
};

/**
 * One path segment Connection accepts in an exact Fetch route.
 *
 * The published chunk names are hashed (`mermaid.core-ClIT2jZ-.mjs`), so they
 * pass; a name that does not is skipped instead of being rewritten into a URL
 * the engine would never ask for.
 */
const SEGMENT = /^[A-Za-z0-9_$.-]+$/u;

/**
 * Resolve the installed engine's `lib/` directory.
 *
 * `install.sh` materializes the pinned engine beside this plugin under
 * `vendor/muya-core`, which keeps 13 MB of published artifacts out of the
 * overlay's own history; an ordinary `node_modules` install is the fallback so
 * a hand-run `npm install` here also works.
 * @returns the absolute `lib/` path, or undefined when the engine is absent.
 */
function engineRoot() {
  const vendored = join(dirname(fileURLToPath(import.meta.url)), "vendor", "muya-core", "lib");
  if (existsSync(vendored)) return vendored;
  try {
    const manifest = createRequire(import.meta.url).resolve("@muyajs/core/package.json");
    return join(dirname(manifest), "lib");
  } catch {
    return undefined;
  }
}

/**
 * Mirror one directory tree into the two route spaces.
 * @param root - absolute `lib/` directory.
 * @returns module-space entries, asset-space entries, and the files skipped.
 */
function mirror(root) {
  const modules = new Map();
  const assets = new Map();
  let skipped = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || statSync(absolute).size === 0) continue;
      const relativePath = relative(root, absolute).split(sep).join(posix.sep);
      if (!relativePath.split(posix.sep).every((segment) => SEGMENT.test(segment))) {
        skipped += 1;
        continue;
      }
      const isModule = MODULE_TYPES.has(extname(entry.name).toLowerCase());
      modules.set(`${MODULE_PREFIX}/${relativePath}`, {
        absolute,
        assetUrl: isModule ? undefined : `${ASSET_PREFIX}/${relativePath}`
      });
      if (!isModule) assets.set(`${ASSET_PREFIX}/${relativePath}`, absolute);
    }
  };
  walk(root);
  return { modules, assets, skipped };
}

/** Response headers every engine answer carries. */
const BASE_HEADERS = {
  "Cache-Control": "private, max-age=300",
  "X-Content-Type-Options": "nosniff"
};

/**
 * Point a stylesheet's relative references at the asset space.
 *
 * The engine stylesheet writes `url(./assets/fonts/x.woff2)`; a CSS fetch is
 * not a module import, so those requests must land in the byte space rather
 * than on the URL-exporting shims.
 * @param css - the stylesheet as published.
 * @returns the stylesheet with absolute asset URLs.
 */
function rewriteCssUrls(css) {
  return css.replaceAll(/url\(\s*(["']?)\.\.?\//gu, (_match, quote) => `url(${quote}${ASSET_PREFIX}/`);
}

/**
 * Answer one file in the module space.
 * @param entry - the mirrored file and, for a non-module asset, its byte-space URL.
 * @param request - the authenticated request.
 * @returns the file, the icon shim, or a failure response.
 */
async function serveModule(entry, request) {
  const { absolute, assetUrl } = entry;
  const extension = extname(absolute).toLowerCase();
  const headers = { ...BASE_HEADERS };
  if (MODULE_TYPES.has(extension)) headers["Content-Type"] = MEDIA_TYPES[extension] ?? "text/plain; charset=utf-8";
  else headers["Content-Type"] = "text/javascript; charset=utf-8";
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  try {
    if (MODULE_TYPES.has(extension)) {
      const body = await readFile(absolute, "utf8");
      if (extension === ".css") {
        return new Response(rewriteCssUrls(body), { status: 200, headers });
      }
      return new Response(body, { status: 200, headers });
    }
    // A browser cannot execute an image as a module, so the module space hands
    // back the URL of the byte space instead — which is how the engine consumes it.
    return new Response(`export default ${JSON.stringify(assetUrl)};\n`, { status: 200, headers });
  } catch {
    return Response.json({ error: "engine-asset-missing", file: absolute }, { status: 500 });
  }
}

/**
 * Answer one raw engine asset.
 * @param absolute - the file this route owns.
 * @param request - the authenticated request.
 * @returns the bytes, or a failure response.
 */
async function serveAsset(absolute, request) {
  const headers = {
    ...BASE_HEADERS,
    "Content-Type": MEDIA_TYPES[extname(absolute).toLowerCase()] ?? "application/octet-stream"
  };
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  try {
    return new Response(await readFile(absolute), { status: 200, headers });
  } catch {
    return Response.json({ error: "engine-asset-missing", file: absolute }, { status: 500 });
  }
}

/**
 * Register one explanatory status route, for a plugin whose engine is missing.
 * @param ctx - host context.
 * @param error - stable code the pane reports.
 * @param detail - what the operator should do.
 */
function registerStatus(ctx, error, detail) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: STATUS_PATH,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: () => Response.json({ error, detail }, { status: 503 })
  }), "sidebar-markdown: engine status");
}

/** Required host service: the shared, cookie-authenticated API channel. */
export const inject = ["connection"];

/**
 * Register the engine's mirrored files for the caller's lifetime.
 * @param ctx - host context carrying the shared API channel.
 */
export function apply(ctx) {
  const root = engineRoot();
  if (root === undefined) {
    registerStatus(ctx, "engine-not-installed", "@muyajs/core is missing beside this plugin; restore this bundle's vendor/muya-core directory, then restart dsh web");
    return;
  }
  const { modules, assets } = mirror(root);
  if (modules.size === 0) {
    registerStatus(ctx, "engine-empty", `${root} holds no servable file`);
    return;
  }
  ctx.effect(() => {
    const disposers = [
      ...[...modules].map(([path, entry]) => ctx.connection.fetch.register({
        path,
        methods: ["GET", "HEAD"],
        requestBody: "buffered",
        fetch: (request) => serveModule(entry, request)
      })),
      ...[...assets].map(([path, absolute]) => ctx.connection.fetch.register({
        path,
        methods: ["GET", "HEAD"],
        requestBody: "buffered",
        fetch: (request) => serveAsset(absolute, request)
      }))
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "sidebar-markdown: engine files");
}

// No `export default apply` here: the Loader's `unwrapExports` is
// `exports.default ?? exports`, so a default would collapse this namespace
// plugin to the bare function and drop `inject` (postmortem 0001).
