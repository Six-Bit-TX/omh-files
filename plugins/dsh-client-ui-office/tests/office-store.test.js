import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { createOfficeStore } from '../office-store.js';

const SECRET = 'office-test-only-secret-with-more-than-32-characters';
const EDITOR = 'http://127.0.0.1:39110';
const BRIDGE = 'http://127.0.0.1:39111';

function jwt(payload, secret = SECRET, header = { alg: 'HS256', typ: 'JWT' }) {
  const parts = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url'));
  const input = parts.join('.');
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}

function request(id, status = 6, url = `${EDITOR}/cache/files/result/output.docx`, extra = {}) {
  const body = { key: id, status, url, ...extra };
  return { body, authorization: `Bearer ${jwt({ payload: body })}` };
}

function sourceAuthorization(config) {
  return `Bearer ${jwt({ payload: { url: config.document.url } })}`;
}

async function fixture(t, options = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omchor-office-store-')));
  const calls = [];
  let output = Buffer.from('edited document');
  const resolveFile = async ({ path }) => {
    const absolute = resolve(directory, path);
    const offset = relative(directory, absolute);
    if (offset === '..' || offset.startsWith(`..${sep}`)) throw Object.assign(new Error('Outside workspace'), { code: 'forbidden' });
    return absolute;
  };
  const store = createOfficeStore({
    resolveFile, editorOrigin: EDITOR, bridgeOrigin: BRIDGE, secret: SECRET,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === `${EDITOR}/coauthoring/CommandService.ashx`) return Response.json({ error: 0 });
      return new Response(output);
    },
    ...options,
  });
  t.after(async () => {
    await store.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'example.docx');
  await writeFile(file, 'original document');
  await chmod(file, 0o640);
  return { directory, file, store, calls, setOutput: value => { output = Buffer.from(value); } };
}

test('opens a signed local snapshot and saves with an original backup and preserved permissions', async t => {
  const { store, file, calls } = await fixture(t);
  const { id, config } = await store.open({ sessionId: 'session-a', path: 'example.docx', lang: 'zh-CN' });
  assert.equal(config.documentType, 'word');
  assert.equal(config.document.key, id);
  assert.equal(config.document.url, `${BRIDGE}/source?id=${id}`);
  assert.equal(config.editorConfig.callbackUrl, `${BRIDGE}/callback?id=${id}`);
  assert.equal(config.editorConfig.lang, 'zh-CN');
  assert.deepEqual(config.editorConfig.user, { id: 'omchor-local', name: '本地编辑' });
  assert.deepEqual(config.editorConfig.customization, { forcesave: false, autosave: true, uiTheme: 'theme-white', macros: false, plugins: false, help: false });
  const { token, ...unsigned } = config;
  assert.equal(token, jwt(unsigned));
  const snapshot = store.source(id, sourceAuthorization(config));
  assert.equal(snapshot.data.toString(), 'original document');
  assert.match(snapshot.contentType, /wordprocessingml/u);
  snapshot.data.fill(0);
  assert.equal(store.source(id, sourceAuthorization(config)).data.toString(), 'original document');
  assert.deepEqual(await store.callback(id, request(id)), { error: 0 });
  assert.equal(await readFile(file, 'utf8'), 'edited document');
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  const status = store.status(id);
  assert.equal(status.state, 'saved');
  assert.equal(status.closed, false);
  assert.equal(typeof status.savedAt, 'number');
  assert.equal(await readFile(status.backupPath, 'utf8'), 'original document');
  assert.equal((await stat(status.backupPath)).mode & 0o777, 0o600);
  assert.equal(dirname(status.backupPath), dirname(file));
  assert.match(status.backupPath, /\.example\.docx\.omchor-backup-/u);
  assert.equal(Object.hasOwn(status, 'data'), false);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(store.source(id, sourceAuthorization(config)).data.toString(), 'original document');
});

test('refuses forged, expired, wrong-document and body-mismatched signatures before downloading', async t => {
  const { store, file, calls } = await fixture(t);
  const first = await store.open({ sessionId: 'a', path: 'example.docx' });
  const second = await store.open({ sessionId: 'b', path: 'example.docx' });
  const authorization = sourceAuthorization(first.config);
  assert.throws(() => store.source(first.id), { code: 'unauthorized' });
  assert.throws(() => store.source(second.id, authorization), { code: 'unauthorized' });
  assert.throws(() => store.source(first.id, `Bearer ${jwt({ payload: { url: first.config.document.url } }, 'wrong-secret')}`), { code: 'unauthorized' });
  assert.throws(() => store.source(first.id, `Bearer ${jwt({ payload: { url: first.config.document.url } }, SECRET, { alg: 'none' })}`), { code: 'unauthorized' });
  assert.throws(() => store.source(first.id, `Bearer ${jwt({ exp: 1, payload: { url: first.config.document.url } })}`), { code: 'unauthorized' });
  const signed = request(first.id);
  await assert.rejects(store.callback(first.id, { ...signed, body: { ...signed.body, status: 2 } }), { code: 'unauthorized' });
  await assert.rejects(store.callback(second.id, signed), { code: 'unauthorized' });
  await assert.rejects(store.callback(first.id, { body: signed.body, authorization: 'Bearer bogus' }), { code: 'unauthorized' });
  assert.equal(calls.length, 0);
  assert.equal(await readFile(file, 'utf8'), 'original document');
  assert.equal(store.status(first.id).state, 'ready');
});

test('accepts official token-only callback bodies and refuses conflicting open body fields', async t => {
  const { store, file } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  const body = request(id).body;
  assert.deepEqual(await store.callback(id, { body: { token: jwt(body) } }), { error: 0 });
  assert.equal(await readFile(file, 'utf8'), 'edited document');
  await assert.rejects(store.callback(id, { body: { ...body, status: 2, token: jwt(body) } }), { code: 'unauthorized' });
});

test('rejects final and ancestor symlinks before reading any document', async t => {
  const { store, file, directory } = await fixture(t);
  await symlink(file, join(directory, 'link.docx'));
  await assert.rejects(store.open({ sessionId: 'a', path: 'link.docx' }), { code: 'unsafe-path' });
  const nested = join(directory, 'nested');
  await mkdir(nested);
  await writeFile(join(nested, 'nested.docx'), 'nested document');
  await symlink(nested, join(directory, 'linked-directory'));
  await assert.rejects(store.open({ sessionId: 'a', path: 'linked-directory/nested.docx' }), { code: 'unsafe-path' });
  await assert.rejects(store.open({ sessionId: 'a', path: '../outside.docx' }), { code: 'forbidden' });
  assert.equal(store.activeCount(), 0);
});

test('rechecks symlink components after downloading and never follows the replacement', async t => {
  let fixtureData;
  const ctx = await fixture(t, {
    fetchImpl: async () => {
      await rename(fixtureData.file, `${fixtureData.file}.original`);
      await symlink(fixtureData.other, fixtureData.file);
      return new Response('edited document');
    },
  });
  fixtureData = { ...ctx, other: join(ctx.directory, 'other.docx') };
  await writeFile(fixtureData.other, 'do not overwrite');
  const { id } = await ctx.store.open({ sessionId: 'a', path: 'example.docx' });
  assert.deepEqual(await ctx.store.callback(id, request(id)), { error: 1 });
  assert.equal(ctx.store.status(id).state, 'error');
  assert.equal(await readFile(fixtureData.other, 'utf8'), 'do not overwrite');
  assert.equal(await readFile(`${ctx.file}.original`, 'utf8'), 'original document');
  assert.ok((await lstat(ctx.file)).isSymbolicLink());
});

test('rejects an external edit and preserves it without creating a backup or overwriting it', async t => {
  const { store, file } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  await writeFile(file, 'external edit');
  assert.deepEqual(await store.callback(id, request(id)), { error: 1 });
  assert.equal(store.status(id).state, 'conflict');
  assert.equal(store.status(id).backupPath, undefined);
  assert.equal(await readFile(file, 'utf8'), 'external edit');
});

test('serializes two editors of one file and refuses the stale editor', async t => {
  const { store, file } = await fixture(t);
  const first = await store.open({ sessionId: 'a', path: 'example.docx' });
  const second = await store.open({ sessionId: 'b', path: 'example.docx' });
  const result = await Promise.all([store.callback(first.id, request(first.id)), store.callback(second.id, request(second.id))]);
  assert.deepEqual(result, [{ error: 0 }, { error: 1 }]);
  assert.equal(store.status(second.id).state, 'conflict');
  assert.equal(await readFile(file, 'utf8'), 'edited document');
});

test('duplicate and byte-identical saves acknowledge success without replacing the file', async t => {
  const { store, file, setOutput } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  setOutput('original document');
  const original = await stat(file, { bigint: true });
  assert.deepEqual(await store.callback(id, request(id)), { error: 0 });
  assert.equal(store.status(id).backupPath, undefined);
  assert.equal(typeof store.status(id).savedAt, 'number');
  assert.equal((await stat(file, { bigint: true })).ino, original.ino);
  setOutput('edited document');
  assert.deepEqual(await store.callback(id, request(id)), { error: 0 });
  const changed = await stat(file, { bigint: true });
  const backup = store.status(id).backupPath;
  assert.deepEqual(await store.callback(id, request(id)), { error: 0 });
  const duplicate = await stat(file, { bigint: true });
  assert.equal(duplicate.ino, changed.ino);
  assert.equal(duplicate.mtimeNs, changed.mtimeNs);
  assert.equal(store.status(id).backupPath, backup);
  assert.equal(await readFile(backup, 'utf8'), 'original document');
});

test('requests a bounded signed forcesave command and only acknowledges its matching revision', async t => {
  const { store, file, calls } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  const before = await stat(file, { bigint: true });
  assert.deepEqual(await store.requestSave(id, { revision: 'request_A-123' }), { accepted: true });
  assert.equal(calls.length, 1);
  const command = { c: 'forcesave', key: id, userdata: 'request_A-123' };
  assert.equal(calls[0].url, `${EDITOR}/coauthoring/CommandService.ashx`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(calls[0].init.body), { ...command, token: jwt(command) });
  assert.equal((await stat(file, { bigint: true })).mtimeNs, before.mtimeNs);
  assert.equal(store.status(id).savedRevision, undefined);
  const signed = request(id, 6, undefined, { userdata: command.userdata });
  await assert.rejects(store.callback(id, { ...signed, body: { ...signed.body, userdata: 'forged' } }), { code: 'unauthorized' });
  assert.deepEqual(await store.callback(id, signed), { error: 0 });
  assert.equal(store.status(id).savedRevision, command.userdata);
  assert.equal(await readFile(file, 'utf8'), 'edited document');
  const downloaded = calls.length;
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'unknown' })), { error: 1 });
  assert.equal(calls.length, downloaded);
  assert.equal(store.status(id).savedRevision, command.userdata);
  assert.deepEqual(await store.callback(id, request(id)), { error: 0 });
  assert.equal(store.status(id).savedRevision, undefined);
  assert.equal(typeof store.status(id).savedAt, 'number');
});

test('keeps request A distinct from pending B and discards older callbacks after B commits', async t => {
  const { store, file, calls, setOutput } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  await store.requestSave(id, { revision: 'revision-A' });
  await store.requestSave(id, { revision: 'revision-B' });
  await store.requestSave(id, { revision: 'revision-C' });
  setOutput('document A');
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'revision-A' })), { error: 0 });
  assert.equal(store.status(id).savedRevision, 'revision-A');
  assert.notEqual(store.status(id).savedRevision, 'revision-B');
  setOutput('document C');
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'revision-C' })), { error: 0 });
  assert.equal(store.status(id).savedRevision, 'revision-C');
  const saved = store.status(id).savedAt;
  const downloaded = calls.length;
  setOutput('stale document B');
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'revision-B' })), { error: 0 });
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'revision-A' })), { error: 0 });
  assert.equal(calls.length, downloaded);
  assert.equal(store.status(id).savedRevision, 'revision-C');
  assert.equal(store.status(id).savedAt, saved);
  assert.equal(await readFile(file, 'utf8'), 'document C');
  setOutput('native document save');
  assert.deepEqual(await store.callback(id, request(id)), { error: 0 });
  assert.equal(store.status(id).savedRevision, undefined);
  assert.equal(await readFile(file, 'utf8'), 'native document save');
});

test('registers a save revision before a fast callback arrives and acknowledges identical bytes', async t => {
  let store;
  let id;
  const ctx = await fixture(t, {
    fetchImpl: async (url, init) => {
      if (url.endsWith('/CommandService.ashx')) {
        const { userdata } = JSON.parse(init.body);
        assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata })), { error: 0 });
        return Response.json({ error: 0 });
      }
      return new Response('original document');
    },
  });
  store = ctx.store;
  ({ id } = await store.open({ sessionId: 'a', path: 'example.docx' }));
  const before = await stat(ctx.file, { bigint: true });
  assert.deepEqual(await store.requestSave(id, { revision: 'fast-callback' }), { accepted: true });
  assert.equal(store.status(id).savedRevision, 'fast-callback');
  assert.equal(typeof store.status(id).savedAt, 'number');
  assert.equal(store.status(id).backupPath, undefined);
  assert.equal((await stat(ctx.file, { bigint: true })).mtimeNs, before.mtimeNs);
});

test('a callback older than the bounded revision history cannot roll back the local file', async t => {
  const { store, file, calls, setOutput } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  setOutput('original document');
  for (let index = 0; index < 101; index += 1) {
    const revision = `revision-${index}`;
    await store.requestSave(id, { revision });
    assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: revision })), { error: 0 });
  }
  const downloaded = calls.length;
  setOutput('very stale document');
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'revision-0' })), { error: 1 });
  assert.equal(calls.length, downloaded);
  assert.equal(store.status(id).savedRevision, 'revision-100');
  assert.equal(await readFile(file, 'utf8'), 'original document');
});

test('bounds pending revisions and validates identifiers and document lifecycle before commands', async t => {
  const { store, calls } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  for (const revision of [undefined, '', 10, 'contains space', 'x'.repeat(101)]) {
    await assert.rejects(store.requestSave(id, { revision }), { code: 'bad-request' });
  }
  assert.equal(calls.length, 0);
  await Promise.all(Array.from({ length: 32 }, (_, index) => store.requestSave(id, { revision: `nonce-${index}` })));
  await assert.rejects(store.requestSave(id, { revision: 'nonce-0' }), { code: 'duplicate-revision' });
  await assert.rejects(store.requestSave(id, { revision: 'nonce-32' }), { code: 'save-limit' });
  assert.deepEqual(await store.callback(id, request(id, 6, undefined, { userdata: 'nonce-0' })), { error: 0 });
  await store.requestSave(id, { revision: 'nonce-32' });
  await assert.rejects(store.requestSave(id, { revision: 'nonce-0' }), { code: 'duplicate-revision' });
  assert.deepEqual(await store.callback(id, request(id, 4)), { error: 0 });
  await assert.rejects(store.requestSave(id, { revision: 'closed-document' }), { code: 'closed' });
});

test('command error 4 does not acknowledge a revision and command failures stay bounded', async t => {
  const cases = [
    { make: () => Response.json({ error: 4 }), result: { accepted: false, unchanged: true } },
    { make: () => Response.json({ error: 1 }), code: 'save-command' },
    { make: () => Response.json({ error: '0' }), code: 'save-command' },
    { make: () => new Response('invalid json'), code: 'save-command' },
    { make: () => new Response(null, { status: 302, headers: { location: 'http://example.com' } }), code: 'output-download' },
    { make: () => new Response('x'.repeat(64 * 1024 + 1)), code: 'too-large' },
    { make: () => new Response('{}', { headers: { 'content-length': '65537' } }), code: 'too-large' },
  ];
  for (const item of cases) {
    const { store, file } = await fixture(t, { fetchImpl: async () => item.make() });
    const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
    for (let retry = 0; retry < 2; retry += 1) {
      const saving = store.requestSave(id, { revision: 'not-accepted' });
      if (item.result) assert.deepEqual(await saving, item.result);
      else await assert.rejects(saving, { code: item.code });
    }
    assert.equal(store.status(id).savedRevision, undefined);
    assert.equal(store.status(id).savedAt, undefined);
    assert.equal(await readFile(file, 'utf8'), 'original document');
  }
});

test('rejects foreign output hosts, cache traversal, and redirects', async t => {
  const { store, file, calls } = await fixture(t);
  for (const url of ['http://localhost:22/cache/files/x', `${EDITOR}/api/secrets`, `${EDITOR}/cache/files/%252e%252e/secrets`, `${EDITOR}/cache/files/%5csecrets`]) {
    const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
    assert.deepEqual(await store.callback(id, request(id, 6, url)), { error: 1 });
    assert.equal(store.status(id).state, 'error');
  }
  assert.equal(calls.length, 0);
  assert.equal(await readFile(file, 'utf8'), 'original document');
  const redirected = await fixture(t, { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://example.com/secret' } }) });
  const { id } = await redirected.store.open({ sessionId: 'a', path: 'example.docx' });
  assert.deepEqual(await redirected.store.callback(id, request(id)), { error: 1 });
  assert.equal(await readFile(redirected.file, 'utf8'), 'original document');
});

test('maps only the authenticated public editor cache URL to the fixed local editor', async t => {
  const { store, calls } = await fixture(t);
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx', publicOrigin: 'https://omh.example' });
  assert.deepEqual(await store.callback(id, request(id, 6, 'https://omh.example/office/cache/files/a/output.docx?md5=test')), { error: 0 });
  assert.equal(calls[0].url, `${EDITOR}/cache/files/a/output.docx?md5=test`);
});

test('supports DOCX XLSX PPTX and rejects other formats, directories, and oversized input', async t => {
  const { store, directory } = await fixture(t);
  for (const [extension, type] of [['docx', 'word'], ['xlsx', 'cell'], ['pptx', 'slide']]) {
    await writeFile(join(directory, `file.${extension}`), 'content');
    const { config } = await store.open({ sessionId: 'a', path: `file.${extension}` });
    assert.equal(config.documentType, type);
    assert.deepEqual(config.editorConfig.user, { id: 'omchor-local', name: 'Local editor' });
  }
  await writeFile(join(directory, 'legacy.doc'), 'content');
  await assert.rejects(store.open({ sessionId: 'a', path: 'legacy.doc' }), { code: 'unsupported-format' });
  await mkdir(join(directory, 'directory.docx'));
  await assert.rejects(store.open({ sessionId: 'a', path: 'directory.docx' }), { code: 'not-regular-file' });
  const small = await fixture(t, { maxBytes: 4 });
  await assert.rejects(small.store.open({ sessionId: 'a', path: 'example.docx' }), { code: 'too-large' });
});

test('bounds both advertised and streaming output sizes', async t => {
  for (const advertised of [true, false]) {
    const { store, file } = await fixture(t, {
      maxBytes: 20,
      fetchImpl: async () => new Response('x'.repeat(21), advertised ? { headers: { 'content-length': '21' } } : undefined),
    });
    const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
    assert.deepEqual(await store.callback(id, request(id)), { error: 1 });
    assert.match(store.status(id).error, /size limit/u);
    assert.equal(await readFile(file, 'utf8'), 'original document');
  }
});

test('uses the harness writer with the expected hash and reports its stale-version refusal', async t => {
  let commit;
  const { store, file } = await fixture(t, {
    commitFile: async input => {
      commit = input;
      throw Object.assign(new Error('Core write conflict'), { code: 'conflict' });
    },
  });
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  assert.deepEqual(await store.callback(id, request(id)), { error: 1 });
  assert.equal(commit.absolutePath, file);
  assert.equal(commit.sessionId, 'a');
  assert.equal(commit.content.toString(), 'edited document');
  assert.match(commit.expectedHash, /^[a-f0-9]{64}$/u);
  assert.equal(store.status(id).state, 'conflict');
  assert.equal(await readFile(file, 'utf8'), 'original document');
  assert.equal(await readFile(store.status(id).backupPath, 'utf8'), 'original document');
});

test('closed documents release active slots and retain only bounded recent status', async t => {
  const { store, file } = await fixture(t, { maxSessions: 1, maxClosedSessions: 1 });
  const first = await store.open({ sessionId: 'a', path: 'example.docx' });
  assert.equal(store.activeCount(), 1);
  await assert.rejects(store.open({ sessionId: 'a', path: 'example.docx' }), { code: 'session-limit' });
  const unchanged = { key: first.id, status: 4 };
  assert.deepEqual(await store.callback(first.id, { body: unchanged, authorization: `Bearer ${jwt({ payload: unchanged })}` }), { error: 0 });
  assert.equal(store.activeCount(), 0);
  assert.equal(store.status(first.id).closed, true);
  assert.equal(store.status(first.id).savedAt, undefined);
  assert.throws(() => store.source(first.id, sourceAuthorization(first.config)), { code: 'closed' });
  const second = await store.open({ sessionId: 'a', path: 'example.docx' });
  assert.deepEqual(await store.callback(second.id, request(second.id, 2)), { error: 0 });
  assert.equal(store.activeCount(), 0);
  assert.equal(store.status(second.id).closed, true);
  assert.throws(() => store.status(first.id), { code: 'not-found' });
  const version = await stat(file, { bigint: true });
  assert.deepEqual(await store.callback(second.id, request(second.id, 2)), { error: 0 });
  assert.equal((await stat(file, { bigint: true })).ino, version.ino);
});

test('disposal waits for an in-flight save and rejects subsequent access', async t => {
  let release;
  let started;
  const downloading = new Promise(resolveStarted => { started = resolveStarted; });
  const response = new Promise(resolveResponse => { release = resolveResponse; });
  const { store, file } = await fixture(t, { fetchImpl: () => { started(); return response; } });
  const { id } = await store.open({ sessionId: 'a', path: 'example.docx' });
  const saving = store.callback(id, request(id));
  await downloading;
  let disposed = false;
  const ending = store.dispose().then(() => { disposed = true; });
  await Promise.resolve();
  assert.equal(disposed, false);
  release(new Response('edited document'));
  assert.deepEqual(await saving, { error: 0 });
  await ending;
  assert.equal(await readFile(file, 'utf8'), 'edited document');
  assert.throws(() => store.status(id), { code: 'disposed' });
  assert.throws(() => store.open({ sessionId: 'a', path: 'example.docx' }), { code: 'disposed' });
});
