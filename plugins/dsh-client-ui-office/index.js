/** Authenticated Office tabs backed by a local, separately installed editor. */
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute, parse, sep } from 'node:path';
import { createOfficeStore } from './office-store.js';

const PREFIX = '/office';
const HEADERS = { 'content-type': 'application/json', 'cache-control': 'private, no-store' };
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

/** Reject aliases before handing a lexical host path to the editor store. */
async function noLinks(path) {
  let current = parse(path).root;
  for (const component of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, component);
    if ((await lstat(current)).isSymbolicLink()) throw fail(403, 'Office editing does not follow symbolic links.');
  }
}

/** Resolve and reauthorize the local workspace at every open and save. */
export async function resolveOfficeFile(ctx, { sessionId, path }, signal) {
  if (typeof sessionId !== 'string' || !sessionId || typeof path !== 'string' || !path || path.includes('\0')) throw fail(400, 'A session and file path are required.');
  if (path.split(/[\\/]/).includes('..')) throw fail(403, 'Office paths cannot contain parent traversal.');
  const live = ctx.sessions.get(sessionId);
  const stored = live ? undefined : await ctx.get('sessionPersistence')?.stat(sessionId);
  const header = live?.header ?? stored?.header;
  if (!header) throw fail(404, 'Session not found.');
  const cwd = header.cwd ?? ctx.sandboxPolicy.workspaceRoot;
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw fail(403, 'A local workspace is required.');
  const absolute = resolve(cwd, path);
  const relativePath = relative(cwd, absolute);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw fail(403, 'Office files must be inside this workspace.');
  await noLinks(absolute);
  const root = await ctx.fs.resolve(cwd, { signal });
  const target = await ctx.fs.resolve(path, { cwd, signal });
  if (!ctx.fs.contains(root, target)) throw fail(403, 'Office files must be inside this workspace.');
  if (ctx.fs.processPath(target) !== absolute || ctx.fs.processPathFromHostPath(absolute) !== absolute) throw fail(501, 'Office editing requires a shared local filesystem.');
  const info = await ctx.fs.stat(target, signal);
  if (info?.type !== 'file') throw fail(404, 'Office file not found.');
  const policy = { ...ctx.sandboxPolicy.resolve(live ? { session: live } : {}), workspaceRoot: cwd };
  if (policy.mode === 'read-only') throw fail(403, 'This workspace is read-only.');
  return { absolute, target, policy };
}

/** Commit exact bytes through the same version guard and lock as ordinary file edits. */
async function commitOfficeFile(ctx, request, maxBytes) {
  const { absolute, target, policy } = await resolveOfficeFile(ctx, request);
  if (absolute !== request.absolutePath) throw fail(409, 'The file location changed.');
  const info = await ctx.fs.stat(target);
  const bytes = await ctx.fs.readBytes(target, undefined, maxBytes);
  if (bytes.length > maxBytes || createHash('sha256').update(bytes).digest('hex') !== request.expectedHash) throw Object.assign(fail(409, 'The file changed outside this editor.'), { code: 'conflict' });
  await noLinks(absolute);
  try {
    await ctx.fs.writeBytes(target, request.content, { kind: 'replaceIfVersion', version: info.version }, undefined, policy);
  } catch (error) {
    if (error.code === 'FS_STALE_VERSION') error.code = 'conflict';
    throw error;
  }
}

/** Read deployment settings separately from plugin code; credentials stay owner-only. */
async function readConfig(options) {
  const file = options.configPath ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'office', 'config.json');
  const info = await lstat(file);
  if (!info.isFile() || (info.mode & 0o077)) throw fail(503, 'Office configuration must be an owner-only regular file.');
  const config = JSON.parse(await readFile(file, 'utf8'));
  const url = new URL(config.editorOrigin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw fail(503, 'Office service must use a local loopback HTTP origin.');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(config.bridgeHost) || config.bridgeHost === '0.0.0.0') throw fail(503, 'Office bridge must bind a specific local IPv4 address.');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(config.secret)) throw fail(503, 'Office service secret is invalid.');
  for (const key of ['maxFileBytes', 'maxSessions']) if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw fail(503, `Office ${key} must be a positive integer.`);
  return config;
}

/** Proxy only to the configured loopback service, with browser credentials stripped. */
export function proxyOffice(ctx, editorOrigin, req, res, head, sockets = new Set()) {
  const rejection = ctx.connection.requestRejection(req);
  if (rejection !== undefined) {
    if (head !== undefined) { res.end(`HTTP/1.1 ${rejection} Rejected\r\nConnection: close\r\n\r\n`); }
    else { res.writeHead(rejection); res.end('Office request refused.'); }
    return;
  }
  const incoming = new URL(req.url, 'http://local');
  if (!incoming.pathname.startsWith(PREFIX + '/')) {
    if (head !== undefined) res.destroy();
    else { res.writeHead(404); res.end(); }
    return;
  }
  const target = new URL(editorOrigin);
  const headers = { ...req.headers, host: target.host, 'x-forwarded-host': `${req.headers.host}${PREFIX}`, 'x-forwarded-proto': req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http' };
  delete headers.cookie;
  delete headers.authorization;
  delete headers['x-forwarded-for'];
  const upstream = httpRequest(target, { method: req.method, path: incoming.pathname.slice(PREFIX.length) + incoming.search, headers });
  upstream.on('error', () => {
    if (head !== undefined) res.destroy();
    else if (!res.headersSent) { res.writeHead(502); res.end('The local Office service is unavailable.'); }
    else res.destroy();
  });
  upstream.on('response', response => {
    if (head !== undefined) { response.resume(); res.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`); return; }
    const responseHeaders = { ...response.headers, 'cache-control': 'private, no-store' };
    delete responseHeaders['set-cookie'];
    res.writeHead(response.statusCode, responseHeaders);
    response.pipe(res);
    response.on('error', () => res.destroy());
  });
  if (head !== undefined) {
    upstream.on('upgrade', (response, socket, upstreamHead) => {
      sockets.add(socket);
      sockets.add(res);
      res.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${Object.entries(response.headers).filter(([key]) => key !== 'set-cookie').map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
      if (upstreamHead.length) res.write(upstreamHead);
      if (head.length) socket.write(head);
      res.pipe(socket).pipe(res);
      const close = () => { socket.destroy(); res.destroy(); sockets.delete(socket); sockets.delete(res); };
      socket.on('error', close); res.on('error', close); socket.on('close', close); res.on('close', close);
    });
    upstream.end();
  } else {
    req.pipe(upstream);
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.on('error', () => upstream.destroy());
  }
}

/** Start the credentialed container bridge on the Docker gateway, never the public UI. */
async function bridgeServer(config, createStore) {
  let store;
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    const url = new URL(req.url, 'http://bridge');
    try {
      const id = url.searchParams.get('id');
      if (req.method === 'GET' && url.pathname === '/source') {
        const file = store.source(id, req.headers.authorization);
        res.writeHead(200, { 'content-type': file.contentType, 'content-length': file.data.length });
        res.end(file.data);
      } else if (req.method === 'POST' && url.pathname === '/callback') {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) throw fail(413, 'Callback is too large.');
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = await store.callback(id, { body, authorization: req.headers.authorization });
        res.writeHead(200, HEADERS); res.end(JSON.stringify(result));
      } else { res.writeHead(404); res.end(); }
    } catch (error) {
      res.writeHead(error.status ?? 403, HEADERS); res.end(JSON.stringify({ error: 1 }));
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, config.bridgeHost, done); });
  try { store = createStore(`http://${config.bridgeHost}:${server.address().port}`); }
  catch (error) { await new Promise(done => server.close(done)); throw error; }
  return { server, store };
}

export const inject = ['connection', 'webServer', 'sessions', 'fs', 'sandboxPolicy'];

/** Install routes; the local service starts on first document open and is disposed with the plugin. */
export function apply(ctx, options = {}) {
  let runtime;
  let pending;
  let closed = false;
  const sockets = new Set();
  const upgrades = new Map();
  const active = new Set();
  const start = () => pending ??= (async () => {
    const config = await readConfig(options);
    const health = await fetch(config.editorOrigin + '/healthcheck', { signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.text()).trim() !== 'true') throw fail(503, 'The local Office service is not ready.');
    const script = await fetch(config.editorOrigin + '/web-apps/apps/api/documents/api.js', { signal: AbortSignal.timeout(5000) });
    const version = /const ver = ['"](\/[A-Za-z0-9.-]+)['"]/.exec(await script.text())?.[1];
    if (!version) throw fail(503, 'The installed Office service version is unsupported.');
    const bridge = await bridgeServer(config, bridgeOrigin => createOfficeStore({
      resolveFile: async input => (await resolveOfficeFile(ctx, input)).absolute,
      commitFile: input => commitOfficeFile(ctx, input, config.maxFileBytes),
      editorOrigin: config.editorOrigin, bridgeOrigin, secret: config.secret, maxBytes: config.maxFileBytes, maxSessions: config.maxSessions,
    }));
    runtime = { ...bridge, config, version };
    if (closed) throw fail(503, 'Office plugin is stopping.');
    return runtime;
  })().catch(error => { pending = undefined; throw error; });

  const track = promise => { active.add(promise); promise.finally(() => active.delete(promise)).catch(() => {}); return promise; };
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/office.open', methods: ['POST'], requestBody: 'buffered', fetch: request => track((async () => {
    try {
      if (closed) throw fail(503, 'Office plugin is stopping.');
      const input = await request.json();
      const instance = await start();
      const host = request.headers.get('host');
      const scheme = request.headers.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const result = await instance.store.open({ ...input, publicOrigin: `${scheme}://${host}` });
      if (closed) throw fail(503, 'Office plugin is stopping.');
      const key = result.config.document.key;
      for (const path of [`${PREFIX}${instance.version}/doc/${key}/c/`, `${PREFIX}/doc/${key}/c/`]) {
        if (!upgrades.has(path)) upgrades.set(path, ctx.webServer.registerUpgrade({ path, handler: (req, socket, head) => proxyOffice(ctx, instance.config.editorOrigin, req, socket, head, sockets) }));
      }
      return json({ ...result, scriptUrl: `${PREFIX}/web-apps/apps/api/documents/api.js` });
    } catch (error) { return json({ error: error.code ?? 'office-unavailable', detail: error.code === 'ENOENT' ? 'Local Office is not set up. Run this plugin’s setup.mjs, then retry.' : error.message }, error.status ?? 503); }
  })()) }), 'office: open editor');
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/office.status', methods: ['GET'], requestBody: 'buffered', fetch: request => {
    try { if (!runtime) throw fail(404, 'Office session not found.'); return json(runtime.store.status(new URL(request.url).searchParams.get('id'))); }
    catch (error) { return json({ error: error.message }, error.status ?? 404); }
  } }), 'office: save status');
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/office.save', methods: ['POST'], requestBody: 'buffered', fetch: request => track((async () => {
    try {
      if (closed || !runtime) throw fail(404, 'Office session not found.');
      const { id, revision } = await request.json();
      return json(await runtime.store.requestSave(id, { revision }));
    } catch (error) { return json({ error: error.code ?? 'save-failed', detail: error.message }, error.status ?? 503); }
  })()) }), 'office: save document');
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: (req, res) => {
    if (!runtime) { res.writeHead(503); res.end('Open an Office file to start the local editor.'); return; }
    proxyOffice(ctx, runtime.config.editorOrigin, req, res, undefined, sockets);
  } }), 'office: editor proxy');
  ctx.effect(() => async () => {
    closed = true;
    for (const socket of sockets) socket.destroy();
    await Promise.allSettled([...active, ...(pending ? [pending] : [])]);
    for (const dispose of upgrades.values()) dispose();
    for (const socket of sockets) socket.destroy();
    if (runtime) {
      runtime.server.closeAllConnections();
      await new Promise(done => runtime.server.close(done));
      await runtime.store.dispose();
    }
  }, 'office: teardown');
}
