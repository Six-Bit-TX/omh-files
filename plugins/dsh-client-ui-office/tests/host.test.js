import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, request } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import test from 'node:test';
import { apply, proxyOffice, resolveOfficeFile } from '../index.js';

const SECRET = 'local-office-host-test-secret-123456789';

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const data = `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${data}.${createHmac('sha256', SECRET).update(data).digest('base64url')}`;
}

function version(info) {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omchor-office-host-')));
  const file = join(directory, 'example.docx');
  await writeFile(file, 'original document');
  const live = { header: { cwd: directory } };
  const routes = new Map();
  const upgrades = new Map();
  const disposers = [];
  const writes = [];
  const ctx = {
    sessions: { get: id => id === 'live' ? live : undefined },
    get: name => name === 'sessionPersistence' ? { stat: async id => id === 'stored' ? { header: { cwd: directory } } : undefined } : undefined,
    sandboxPolicy: { workspaceRoot: directory, resolve: () => ({ mode: 'workspace-write', workspaceRoot: directory }) },
    fs: {
      async resolve(path, options = {}) {
        const lexical = isAbsolute(path) ? path : `${options.cwd}/${path}`;
        return { displayPath: lexical, targetKey: await realpath(lexical) };
      },
      contains(root, target) {
        const offset = relative(root.targetKey, target.targetKey);
        return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
      },
      processPath: target => target.targetKey,
      processPathFromHostPath: path => path,
      async stat(target) {
        const info = await stat(target.targetKey, { bigint: true });
        return { type: info.isFile() ? 'file' : 'directory', size: Number(info.size), version: version(info) };
      },
      readBytes: target => readFile(target.targetKey),
      async writeBytes(target, content, intent, signal, policy) {
        const actual = version(await stat(target.targetKey, { bigint: true }));
        if (intent.kind !== 'replaceIfVersion' || intent.version !== actual) {
          throw Object.assign(new Error('File changed before guarded write'), { code: 'FS_STALE_VERSION' });
        }
        writes.push({ target, content, intent, signal, policy });
        await writeFile(target.targetKey, content);
      },
    },
    effect: install => { disposers.push(install()); },
    connection: {
      requestRejection: () => undefined,
      fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path); } },
    },
    webServer: {
      register: () => () => {},
      registerUpgrade: route => { upgrades.set(route.path, route); return () => upgrades.delete(route.path); },
    },
  };
  t.after(async () => {
    for (const dispose of disposers.reverse()) await dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, file, live, ctx, routes, writes, upgrades };
}

async function listen(t, server) {
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(done => server.close(done));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function configured(t, ctx, directory, editorOrigin, overrides = {}) {
  const path = join(directory, 'office-config.json');
  const config = { editorOrigin, bridgeHost: '127.0.0.1', secret: SECRET, maxFileBytes: 1024 * 1024, maxSessions: 8, ...overrides };
  await writeFile(path, JSON.stringify(config), { mode: 0o600 });
  apply(ctx, { configPath: path });
  return path;
}

function openRequest() {
  return new Request('http://127.0.0.1:3080/api/office.open', {
    method: 'POST', headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'live', path: 'example.docx', lang: 'en' }),
  });
}

test('resolves live and persisted sessions through the workspace filesystem', async t => {
  const { ctx, directory, file, live } = await fixture(t);
  for (const sessionId of ['live', 'stored']) {
    const result = await resolveOfficeFile(ctx, { sessionId, path: 'example.docx' });
    assert.equal(result.absolute, file);
    assert.equal(result.target.targetKey, file);
    assert.equal(result.policy.workspaceRoot, directory);
    assert.equal(result.policy.mode, 'workspace-write');
  }
  delete live.header.cwd;
  assert.equal((await resolveOfficeFile(ctx, { sessionId: 'live', path: 'example.docx' })).absolute, file);
});

test('refuses traversal, symlinks, directories and invalid session/path inputs', async t => {
  const { ctx, directory, file } = await fixture(t);
  for (const path of ['../outside.docx', directory]) {
    await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path }), { status: 403 });
  }
  await symlink(file, join(directory, 'linked.docx'));
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'linked.docx' }), { status: 403 });
  await mkdir(join(directory, 'real'));
  await writeFile(join(directory, 'real', 'nested.docx'), 'content');
  await symlink(join(directory, 'real'), join(directory, 'linked'));
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'linked/nested.docx' }), { status: 403 });
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'real' }), { status: 404 });
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'missing', path: 'example.docx' }), { status: 404 });
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: '\0file.docx' }), { status: 400 });
});

test('rejects symlink aliases even when parent traversal returns to the same file', async t => {
  const { ctx, directory } = await fixture(t);
  await mkdir(join(directory, 'real'));
  await symlink(join(directory, 'real'), join(directory, 'linked'));
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'linked/../example.docx' }), { status: 403 });
});

test('refuses read-only policy, remote cwd, nonlocal mappings and filesystem containment failures', async t => {
  const { ctx, live } = await fixture(t);
  const policy = ctx.sandboxPolicy.resolve;
  ctx.sandboxPolicy.resolve = () => ({ mode: 'read-only' });
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'example.docx' }), { status: 403 });
  ctx.sandboxPolicy.resolve = policy;
  const cwd = live.header.cwd;
  live.header.cwd = 'ssh://remote/project';
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'example.docx' }), { status: 403 });
  live.header.cwd = cwd;
  ctx.fs.processPathFromHostPath = path => `remote:${path}`;
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'example.docx' }), { status: 501 });
  ctx.fs.processPathFromHostPath = path => path;
  ctx.fs.contains = () => false;
  await assert.rejects(resolveOfficeFile(ctx, { sessionId: 'live', path: 'example.docx' }), { status: 403 });
});

test('rejects unsafe configuration before contacting an editor', async t => {
  for (const overrides of [
    { editorOrigin: 'https://example.com' },
    { editorOrigin: 'http://127.0.0.1:39100/other' },
    { bridgeHost: '0.0.0.0' },
    { secret: 'short' },
    { maxSessions: 0 },
    { maxFileBytes: -1 },
  ]) {
    const { ctx, directory, routes } = await fixture(t);
    await configured(t, ctx, directory, 'http://127.0.0.1:39100', overrides);
    assert.equal((await routes.get('/api/office.open').fetch(openRequest())).status, 503);
  }
  const { ctx, directory, routes } = await fixture(t);
  const path = await configured(t, ctx, directory, 'http://127.0.0.1:39100');
  await chmod(path, 0o644);
  const response = await routes.get('/api/office.open').fetch(openRequest());
  assert.equal(response.status, 503);
  assert.match((await response.json()).detail, /owner-only/u);
});

test('HTTP proxy checks authorization and strips request/response cookies while preserving path and bytes', { timeout: 10_000 }, async t => {
  let received;
  const editor = await listen(t, createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { headers: req.headers, url: req.url, method: req.method, body: Buffer.concat(chunks).toString() };
    res.writeHead(201, { 'content-type': 'text/plain', 'set-cookie': 'editor-cookie=test; Path=/', 'cache-control': 'public' });
    res.end('editor response');
  }));
  let rejection;
  const ctx = { connection: { requestRejection: () => rejection } };
  const proxy = await listen(t, createServer((req, res) => proxyOffice(ctx, editor, req, res)));
  const response = await fetch(`${proxy}/office/cache/files/output.docx?key=abc`, {
    method: 'POST', body: 'request bytes',
    headers: { cookie: 'browser-session=test', authorization: 'Bearer test-browser-token', 'x-forwarded-for': '192.0.2.1' },
  });
  assert.equal(response.status, 201);
  assert.equal(await response.text(), 'editor response');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(received.url, '/cache/files/output.docx?key=abc');
  assert.equal(received.method, 'POST');
  assert.equal(received.body, 'request bytes');
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers.authorization, undefined);
  assert.equal(received.headers['x-forwarded-for'], undefined);
  assert.equal(received.headers.host, new URL(editor).host);
  assert.equal(received.headers['x-forwarded-host'], `${new URL(proxy).host}/office`);
  received = undefined;
  rejection = 401;
  assert.equal((await fetch(`${proxy}/office/web-apps/apps/api/documents/api.js`)).status, 401);
  assert.equal(received, undefined);
  rejection = undefined;
  assert.equal((await fetch(`${proxy}/officer/cache/files/output.docx`)).status, 404);
  assert.equal(received, undefined);
});

test('WebSocket proxy authenticates upgrades, strips cookies both ways and tunnels bytes', { timeout: 10_000 }, async t => {
  let received;
  const editorServer = createServer();
  editorServer.on('upgrade', (req, socket) => {
    received = { url: req.url, headers: req.headers };
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSet-Cookie: editor-cookie=test; Path=/\r\n\r\n');
    socket.on('data', chunk => socket.write(chunk));
  });
  const editor = await listen(t, editorServer);
  let rejection;
  const ctx = { connection: { requestRejection: () => rejection } };
  const sockets = new Set();
  const proxyServer = createServer();
  proxyServer.on('upgrade', (req, socket, head) => proxyOffice(ctx, editor, req, socket, head, sockets));
  const proxy = await listen(t, proxyServer);
  const connect = () => new Promise((done, reject) => {
    const req = request(`${proxy}/office/doc/test/c/?EIO=4&transport=websocket`, {
      headers: { connection: 'Upgrade', upgrade: 'websocket', cookie: 'browser=test', authorization: 'Bearer test-browser' },
    });
    req.on('error', reject);
    req.on('response', response => { response.resume(); done({ response }); });
    req.on('upgrade', (response, socket) => done({ response, socket }));
    req.end();
  });
  const opened = await connect();
  t.after(() => opened.socket?.destroy());
  assert.equal(opened.response.statusCode, 101);
  assert.equal(opened.response.headers['set-cookie'], undefined);
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers.authorization, undefined);
  assert.equal(received.url, '/doc/test/c/?EIO=4&transport=websocket');
  const echoed = new Promise(done => opened.socket.once('data', done));
  opened.socket.write('tunnel bytes');
  assert.equal((await echoed).toString(), 'tunnel bytes');
  opened.socket.destroy();
  received = undefined;
  rejection = 403;
  assert.equal((await connect()).response.statusCode, 403);
  assert.equal(received, undefined);
});

test('real source, save command and callback routes use the guarded writer and correlated status', { timeout: 10_000 }, async t => {
  const { ctx, directory, routes, writes, file } = await fixture(t);
  const commands = [];
  let commandError = 0;
  const editor = await listen(t, createServer(async (req, res) => {
    if (req.url === '/healthcheck') return res.end('true');
    if (req.url === '/web-apps/apps/api/documents/api.js') return res.end("const ver = '/9.3.1-test';");
    if (req.url === '/coauthoring/CommandService.ashx') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      commands.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: commandError }));
    }
    if (req.url === '/cache/files/result/output.docx') return res.end('edited document');
    res.writeHead(404); res.end();
  }));
  await configured(t, ctx, directory, editor);
  const saveRequest = (id, revision) => new Request('http://127.0.0.1/api/office.save', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, revision }),
  });
  const saveRoute = routes.get('/api/office.save');
  assert.equal((await saveRoute.fetch(saveRequest('not-opened', 'revision-A'))).status, 404);
  const opened = await routes.get('/api/office.open').fetch(openRequest());
  assert.equal(opened.status, 200);
  const { id, config } = await opened.json();
  assert.equal(config.documentType, 'word');
  const source = await fetch(config.document.url, { headers: { authorization: `Bearer ${jwt({ payload: { url: config.document.url } })}` } });
  assert.equal(source.status, 200);
  assert.equal(await source.text(), 'original document');
  assert.equal((await fetch(config.document.url)).status, 401);
  assert.equal((await saveRoute.fetch(saveRequest(id, 'invalid nonce'))).status, 400);
  const accepted = await saveRoute.fetch(saveRequest(id, 'revision-A'));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { accepted: true });
  const unsigned = { c: 'forcesave', key: id, userdata: 'revision-A' };
  assert.deepEqual(commands, [{ ...unsigned, token: jwt(unsigned) }]);
  assert.equal(writes.length, 0);
  const body = { key: id, status: 6, url: `${editor}/cache/files/result/output.docx`, userdata: 'revision-A' };
  const callback = await fetch(config.editorConfig.callbackUrl, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt({ payload: body })}` }, body: JSON.stringify(body),
  });
  assert.deepEqual(await callback.json(), { error: 0 });
  assert.equal(await readFile(file, 'utf8'), 'edited document');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].intent.kind, 'replaceIfVersion');
  assert.equal(writes[0].policy.mode, 'workspace-write');
  assert.equal(writes[0].policy.workspaceRoot, directory);
  const status = await routes.get('/api/office.status').fetch(new Request(`http://127.0.0.1/api/office.status?id=${id}`));
  const result = await status.json();
  assert.equal(result.state, 'saved');
  assert.equal(typeof result.savedAt, 'number');
  assert.equal(result.savedRevision, 'revision-A');
  assert.equal(await readFile(result.backupPath, 'utf8'), 'original document');
  commandError = 4;
  const unchanged = await saveRoute.fetch(saveRequest(id, 'revision-B'));
  assert.equal(unchanged.status, 200);
  assert.deepEqual(await unchanged.json(), { accepted: false, unchanged: true });
  const final = await routes.get('/api/office.status').fetch(new Request(`http://127.0.0.1/api/office.status?id=${id}`));
  assert.equal((await final.json()).savedRevision, 'revision-A');
  assert.equal(writes.length, 1);
});

test('a filesystem version race at the production commit adapter preserves the external write', { timeout: 10_000 }, async t => {
  const { ctx, directory, routes, writes, file } = await fixture(t);
  const editor = await listen(t, createServer((req, res) => {
    if (req.url === '/healthcheck') return res.end('true');
    if (req.url === '/web-apps/apps/api/documents/api.js') return res.end("const ver = '/9.3.1-test';");
    return res.end('edited document');
  }));
  await configured(t, ctx, directory, editor);
  const opened = await routes.get('/api/office.open').fetch(openRequest());
  const { id, config } = await opened.json();
  ctx.fs.readBytes = async target => {
    const original = await readFile(target.targetKey);
    await writeFile(target.targetKey, 'new external content');
    return original;
  };
  const body = { key: id, status: 6, url: `${editor}/cache/files/result/output.docx` };
  const callback = await fetch(config.editorConfig.callbackUrl, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt({ payload: body })}` }, body: JSON.stringify(body),
  });
  assert.deepEqual(await callback.json(), { error: 1 });
  assert.equal(writes.length, 0);
  assert.equal(await readFile(file, 'utf8'), 'new external content');
  const response = await routes.get('/api/office.status').fetch(new Request(`http://127.0.0.1/api/office.status?id=${id}`));
  assert.equal((await response.json()).state, 'conflict');
});
