/** Local Office document snapshots, authenticated callbacks, and guarded saves. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const FORMATS = {
  '.docx': ['word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['cell', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.pptx': ['slide', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};
const JWT_PART = /^[A-Za-z0-9_-]+$/u;
const CONFLICT_CODES = new Set(['conflict', 'FS_STALE', 'FS_VERSION_MISMATCH', 'FS_VERSION_CONFLICT', 'FS_STALE_VERSION']);

function refusal(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function origin(value, name) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw refusal('configuration', `${name} must be an HTTP origin without credentials or a path`);
  }
  return url.origin;
}

function sign(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const content = `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
}

function verify(token, secret) {
  if (typeof token !== 'string' || token.length > 1024 * 1024) {
    throw refusal('unauthorized', 'A signed Office request is required', 401);
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !JWT_PART.test(part))) {
    throw refusal('unauthorized', 'Invalid Office request signature', 401);
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
  const actual = Buffer.from(signaturePart, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw refusal('unauthorized', 'Invalid Office request signature', 401);
  }
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch (error) {
    throw refusal('unauthorized', 'Invalid Office request token JSON', 401);
  }
  if (!object(header) || header.alg !== 'HS256' || header.crit !== undefined || !object(payload)) {
    throw refusal('unauthorized', 'Unsupported Office request signature', 401);
  }
  const now = Date.now() / 1000;
  if ((payload.exp !== undefined && (!Number.isFinite(payload.exp) || payload.exp <= now))
    || (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > now))) {
    throw refusal('unauthorized', 'Office request token is expired or not active', 401);
  }
  return payload;
}

function bearer(authorization) {
  const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_.-]+)$/iu.exec(authorization);
  if (!match) throw refusal('unauthorized', 'A signed Office request is required', 401);
  return match[1];
}

function tokenParameters(payload, wrapped) {
  if (wrapped) {
    if (!object(payload.payload)) throw refusal('unauthorized', 'Office token has no request payload', 401);
    return payload.payload;
  }
  // Registered JWT time claims are metadata, not callback body parameters.
  const parameters = { ...payload };
  delete parameters.iat;
  delete parameters.exp;
  delete parameters.nbf;
  return parameters;
}

function callbackParameters(body, authorization, secret) {
  if (!object(body)) throw refusal('bad-request', 'Office callback must be an object');
  const { token, ...parameters } = body;
  if (token !== undefined) {
    const signed = tokenParameters(verify(token, secret), false);
    // ONLYOFFICE's body-token form may carry only the token. When open body
    // fields are present they must match completely, never merge with claims.
    if (Object.keys(parameters).length !== 0 && !isDeepStrictEqual(signed, parameters)) {
      throw refusal('unauthorized', 'Office callback differs from its signed payload', 401);
    }
    return signed;
  }
  const signed = tokenParameters(verify(bearer(authorization), secret), true);
  if (!isDeepStrictEqual(signed, parameters)) {
    throw refusal('unauthorized', 'Office callback differs from its signed payload', 401);
  }
  return signed;
}

/** Check lexical components before opening; realpath must not change their identity. */
async function inspectPath(absolutePath) {
  if (typeof absolutePath !== 'string' || !isAbsolute(absolutePath)
    || absolutePath.includes('\0') || absolutePath !== resolve(absolutePath)) {
    throw refusal('unsafe-path', 'Office editing requires a normalized absolute file path', 403);
  }
  const root = parse(absolutePath).root;
  let cursor = root;
  const components = absolutePath.slice(root.length).split(sep).filter(Boolean);
  for (let index = 0; index < components.length; index += 1) {
    cursor = join(cursor, components[index]);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw refusal('unsafe-path', 'Office files cannot use symbolic links', 403);
    if (index < components.length - 1 && !info.isDirectory()) {
      throw refusal('unsafe-path', 'Office file parent is not a directory', 403);
    }
    if (index === components.length - 1 && !info.isFile()) {
      throw refusal('not-regular-file', 'Office editing requires a regular file', 403);
    }
  }
  if (components.length === 0 || await realpath(absolutePath) !== absolutePath) {
    throw refusal('unsafe-path', 'Office file path changed during resolution', 403);
  }
}

function sameVersion(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

/** Read from one no-follow handle with a bound even if another process grows it. */
async function readRegular(absolutePath, maxBytes) {
  await inspectPath(absolutePath);
  const handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw refusal('not-regular-file', 'Office editing requires a regular file', 403);
    if (before.size > BigInt(maxBytes)) throw refusal('too-large', 'Office file exceeds the configured size limit', 413);
    const chunks = [];
    let size = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - size));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, size);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maxBytes) throw refusal('too-large', 'Office file exceeds the configured size limit', 413);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    await inspectPath(absolutePath);
    const entry = await lstat(absolutePath, { bigint: true });
    if (!sameVersion(before, after) || !sameVersion(after, entry)) {
      throw refusal('conflict', 'The local file changed while it was being read', 409);
    }
    const data = Buffer.concat(chunks, size);
    return { data, hash: digest(data), mode: Number(after.mode & 0o777n), version: after };
  } finally {
    await handle.close();
  }
}

async function removeOwnedTemp(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/** Create a complete owner-only backup without replacing any existing path. */
async function backupOriginal(record) {
  if (record.backupPath !== undefined) return;
  const backupPath = join(dirname(record.absolutePath), `.${basename(record.absolutePath)}.omchor-backup-${record.id}`);
  const handle = await open(backupPath, 'wx', 0o600);
  let complete = false;
  try {
    await handle.writeFile(record.original);
    await handle.sync();
    complete = true;
  } finally {
    await handle.close();
    if (!complete) await removeOwnedTemp(backupPath);
  }
  record.backupPath = backupPath;
}

/** Native fallback for standalone use; the harness supplies its guarded ctx.fs writer. */
async function nativeCommit(record, content, maxBytes, authorize) {
  const temporary = join(dirname(record.absolutePath), `.${basename(record.absolutePath)}.omchor-save-${randomBytes(18).toString('hex')}`);
  const handle = await open(temporary, 'wx', 0o600);
  let published = false;
  try {
    await handle.writeFile(content);
    await handle.sync();
    await authorize(record);
    const current = await readRegular(record.absolutePath, maxBytes);
    if (current.hash !== record.expectedHash) throw refusal('conflict', 'The local file changed outside this editor', 409);
    await handle.chmod(current.mode);
    await handle.sync();
    await handle.close();
    await rename(temporary, record.absolutePath);
    published = true;
  } finally {
    await handle.close();
    if (!published) await removeOwnedTemp(temporary);
  }
}

function outputUrl(value, editorOrigin, publicOrigin) {
  if (typeof value !== 'string') throw refusal('output-url', 'Office save callback has no output URL');
  const url = new URL(value);
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)) {
    throw refusal('output-url', 'Office output URL is not allowed', 403);
  }
  if (publicOrigin !== undefined && url.origin === publicOrigin && url.pathname.startsWith('/office/cache/files/')) {
    url.pathname = url.pathname.slice('/office'.length);
    const local = new URL(`${url.pathname}${url.search}`, editorOrigin);
    url.host = local.host;
    url.protocol = local.protocol;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch (error) {
    throw refusal('output-url', 'Office output URL has invalid path encoding', 403);
  }
  if (url.origin !== editorOrigin || !url.pathname.startsWith('/cache/files/')
    || !decoded.startsWith('/cache/files/') || decoded.includes('\\')
    || decoded.split('/').some(part => part === '.' || part === '..')
    || /%(?:2e|2f|5c|25)/iu.test(url.pathname)) {
    throw refusal('output-url', 'Office output must come from the configured local editor cache', 403);
  }
  return url.href;
}

async function responseBytes(response, maxBytes) {
  if (!response.ok || response.status >= 300 || response.redirected) {
    await response.body?.cancel();
    throw refusal('output-download', 'The local editor did not return the saved document', 502);
  }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) {
    await response.body?.cancel();
    throw refusal('too-large', 'Office output exceeds the configured size limit', 413);
  }
  if (response.body === null) throw refusal('output-download', 'The local editor returned no document', 502);
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw refusal('too-large', 'Office output exceeds the configured size limit', 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw refusal('output-download', 'The local editor returned an empty document', 502);
  return Buffer.concat(chunks, size);
}

async function download(url, fetchImpl, maxBytes, timeoutMs) {
  const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  return responseBytes(response, maxBytes);
}

/**
 * Create one host-owned store. The resolver must authorize read/write access in
 * the selected Session's workspace and return the lexical absolute local path.
 * It is called again before every save. Production callers supply commitFile to
 * use ctx.fs.writeBytes with its observed version and current write policy.
 * @param options - origins, shared ONLYOFFICE secret, resolver, and optional writer/read bounds.
 * @returns open, source, requestSave, callback, status, and async dispose operations.
 */
export function createOfficeStore({
  resolveFile, commitFile, editorOrigin, bridgeOrigin, secret,
  maxBytes = 64 * 1024 * 1024, downloadTimeoutMs = 30_000, fetchImpl = fetch,
  maxSessions = 32, maxClosedSessions = 100,
}) {
  if (typeof resolveFile !== 'function' || (commitFile !== undefined && typeof commitFile !== 'function')) {
    throw refusal('configuration', 'An Office file resolver and valid optional writer are required');
  }
  if ((typeof secret !== 'string' && !Buffer.isBuffer(secret)) || secret.length < 32) {
    throw refusal('configuration', 'Office JWT secret must contain at least 32 characters or bytes');
  }
  if ([maxBytes, downloadTimeoutMs, maxSessions, maxClosedSessions].some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw refusal('configuration', 'Office size, time, and session limits must be positive integers');
  }
  const editor = origin(editorOrigin, 'editorOrigin');
  const bridge = origin(bridgeOrigin, 'bridgeOrigin');
  const records = new Map();
  const locks = new Map();
  const operations = new Set();
  let disposed = false;
  let opening = 0;

  function activeCount() {
    return opening + [...records.values()].filter(record => !record.closed).length;
  }

  function closeRecord(record) {
    record.closed = true;
    record.closedAt = Date.now();
    record.original = undefined;
    record.issuedRevisions.clear();
    const closed = [...records.values()].filter(item => item.closed)
      .sort((left, right) => left.closedAt - right.closedAt);
    for (const stale of closed.slice(0, Math.max(0, closed.length - maxClosedSessions))) records.delete(stale.id);
  }

  function live() {
    if (disposed) throw refusal('disposed', 'Office editor store has been disposed', 410);
  }

  function recordFor(id) {
    live();
    const record = records.get(id);
    if (record === undefined) throw refusal('not-found', 'Office editing session was not found', 404);
    return record;
  }

  function track(operation) {
    live();
    const pending = Promise.resolve().then(operation);
    operations.add(pending);
    const settled = () => operations.delete(pending);
    pending.then(settled, settled);
    return pending;
  }

  async function serialized(absolutePath, operation) {
    const previous = locks.get(absolutePath) ?? Promise.resolve();
    const pending = previous.then(operation, operation);
    const settled = pending.then(() => undefined, () => undefined);
    locks.set(absolutePath, settled);
    try {
      return await pending;
    } finally {
      if (locks.get(absolutePath) === settled) locks.delete(absolutePath);
    }
  }

  async function authorize(record) {
    const current = await resolveFile({ sessionId: record.sessionId, path: record.path });
    if (current !== record.absolutePath) throw refusal('conflict', 'The workspace file now resolves to another path', 409);
    await inspectPath(current);
  }

  function openDocument({ sessionId, path, lang = 'en', publicOrigin } = {}) {
    return track(async () => {
      if (activeCount() >= maxSessions) throw refusal('session-limit', 'Close an Office document before opening another', 429);
      opening += 1;
      try {
        if (typeof sessionId !== 'string' || !sessionId || typeof path !== 'string' || !path) {
          throw refusal('bad-request', 'Office editing requires a session and file path');
        }
        if (typeof lang !== 'string' || !/^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$/u.test(lang)) {
          throw refusal('bad-request', 'Office editor language is invalid');
        }
        const absolutePath = await resolveFile({ sessionId, path });
        const extension = extname(absolutePath).toLowerCase();
        if (!Object.hasOwn(FORMATS, extension)) throw refusal('unsupported-format', 'Only DOCX, XLSX, and PPTX files can be edited', 415);
        const publicBase = publicOrigin === undefined ? undefined : origin(publicOrigin, 'publicOrigin');
        return await serialized(absolutePath, async () => {
          const identity = { sessionId, path, absolutePath };
          await authorize(identity);
          const snapshot = await readRegular(absolutePath, maxBytes);
          const id = randomBytes(24).toString('base64url');
          const sourceUrl = `${bridge}/source?id=${id}`;
          const config = {
            documentType: FORMATS[extension][0],
            type: 'desktop',
            width: '100%',
            height: '100%',
            document: {
              fileType: extension.slice(1), key: id, title: basename(absolutePath), url: sourceUrl,
              permissions: { edit: true, download: true, print: true, comment: true, review: true, copy: true },
            },
            editorConfig: {
              mode: 'edit', lang, callbackUrl: `${bridge}/callback?id=${id}`,
              user: { id: 'omchor-local', name: lang.toLowerCase().startsWith('zh') ? '本地编辑' : 'Local editor' },
              customization: { forcesave: false, autosave: true, uiTheme: 'theme-white', macros: false, plugins: false, help: false },
            },
          };
          records.set(id, {
            ...identity, id, sourceUrl, publicOrigin: publicBase, contentType: FORMATS[extension][1],
            original: snapshot.data, expectedHash: snapshot.hash, state: 'ready', closed: false,
            issuedRevisions: new Map(), recentRevisions: new Map(), nextSequence: 0, committedSequence: 0,
          });
          return { id, config: { ...config, token: sign(config, secret) } };
        });
      } finally {
        opening -= 1;
      }
    });
  }

  function source(id, authorization) {
    const record = recordFor(id);
    const parameters = tokenParameters(verify(bearer(authorization), secret), true);
    if (!isDeepStrictEqual(parameters, { url: record.sourceUrl })) {
      throw refusal('unauthorized', 'Office source token does not identify this document URL', 401);
    }
    if (record.closed) throw refusal('closed', 'This Office editing session has closed', 410);
    return { data: Buffer.from(record.original), contentType: record.contentType, filename: basename(record.absolutePath) };
  }

  function requestSave(id, { revision } = {}) {
    return track(async () => {
      const record = recordFor(id);
      if (typeof revision !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(revision)) {
        throw refusal('bad-request', 'Office save revision must be an opaque identifier of at most 100 characters');
      }
      if (record.closed) throw refusal('closed', 'This Office editing session has closed', 410);
      if (record.state === 'conflict') throw refusal('conflict', 'Reopen the local file before saving again', 409);
      if (record.issuedRevisions.has(revision) || record.recentRevisions.has(revision)) {
        throw refusal('duplicate-revision', 'Office save revision has already been used', 409);
      }
      if (record.issuedRevisions.size >= 32) throw refusal('save-limit', 'Wait for a pending Office save before requesting another', 429);
      // Register before awaiting the command: its callback may arrive first.
      record.issuedRevisions.set(revision, ++record.nextSequence);
      record.state = 'ready';
      delete record.error;
      try {
        await authorize(record);
        if (record.closed) throw refusal('closed', 'This Office editing session has closed', 410);
        const command = { c: 'forcesave', key: record.id, userdata: revision };
        const response = await fetchImpl(`${editor}/coauthoring/CommandService.ashx`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...command, token: sign(command, secret) }),
          redirect: 'manual', signal: AbortSignal.timeout(downloadTimeoutMs),
        });
        const bytes = await responseBytes(response, 64 * 1024);
        let result;
        try {
          result = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
          throw refusal('save-command', 'The local editor returned an invalid save response', 502);
        }
        if (object(result) && result.error === 0) return { accepted: true };
        record.issuedRevisions.delete(revision);
        if (object(result) && result.error === 4) return { accepted: false, unchanged: true };
        throw refusal('save-command', 'The local editor could not accept the save request', 502);
      } catch (error) {
        record.issuedRevisions.delete(revision);
        throw error;
      }
    });
  }

  function callback(id, { body, authorization } = {}) {
    return track(async () => {
      const record = recordFor(id);
      const parameters = callbackParameters(body, authorization, secret);
      if (parameters.key !== id) throw refusal('unauthorized', 'Office callback key does not match this editing session', 401);
      if (![1, 2, 3, 4, 6, 7].includes(parameters.status)) throw refusal('bad-request', 'Unknown Office callback status');
      if (parameters.status === 3 || parameters.status === 7) {
        record.issuedRevisions.delete(parameters.userdata);
        record.state = 'error';
        record.error = 'The local editor reported a document save failure';
        return { error: 1 };
      }
      if (parameters.status === 4) {
        return serialized(record.absolutePath, () => {
          closeRecord(record);
          return { error: 0 };
        });
      }
      if (parameters.status !== 2 && parameters.status !== 6) return { error: 0 };
      return serialized(record.absolutePath, async () => {
        const sequence = parameters.status === 6
          ? record.issuedRevisions.get(parameters.userdata) ?? record.recentRevisions.get(parameters.userdata)
          : undefined;
        record.issuedRevisions.delete(parameters.userdata);
        if (sequence !== undefined) {
          record.recentRevisions.set(parameters.userdata, sequence);
          while (record.recentRevisions.size > 100) record.recentRevisions.delete(record.recentRevisions.keys().next().value);
          // A retried/late command callback must never roll the disk back to an
          // earlier explicitly requested revision after a newer one committed.
          if (sequence <= record.committedSequence) return { error: 0 };
        }
        try {
          if (parameters.status === 6 && sequence === undefined
            && parameters.userdata !== undefined && parameters.userdata !== null && parameters.userdata !== '') {
            throw refusal('unknown-revision', 'This Office save revision is no longer recognized; request a new save', 409);
          }
          if (record.state === 'conflict') throw refusal('conflict', 'Reopen the local file before saving again', 409);
          await authorize(record);
          const target = outputUrl(parameters.url, editor, record.publicOrigin);
          const content = await download(target, fetchImpl, maxBytes, downloadTimeoutMs);
          await authorize(record);
          const current = await readRegular(record.absolutePath, maxBytes);
          if (current.hash !== record.expectedHash) throw refusal('conflict', 'The local file changed outside this editor', 409);
          const nextHash = digest(content);
          if (nextHash !== record.expectedHash) {
            if (record.closed) throw refusal('closed', 'This Office editing session has already closed', 410);
            await backupOriginal(record);
            if (commitFile === undefined) await nativeCommit(record, content, maxBytes, authorize);
            else {
              await commitFile({
                sessionId: record.sessionId, path: record.path, absolutePath: record.absolutePath,
                content, expectedHash: record.expectedHash,
              });
            }
            record.expectedHash = nextHash;
          }
          record.state = 'saved';
          record.savedAt = Date.now();
          if (sequence !== undefined) {
            record.savedRevision = parameters.userdata;
            record.committedSequence = sequence;
          } else delete record.savedRevision;
          delete record.error;
          if (parameters.status === 2) closeRecord(record);
          return { error: 0 };
        } catch (error) {
          record.state = CONFLICT_CODES.has(error.code) ? 'conflict' : 'error';
          record.error = error.message || 'The local document could not be saved';
          return { error: 1 };
        }
      });
    });
  }

  function status(id) {
    const record = recordFor(id);
    return {
      id: record.id, path: record.path, state: record.state, closed: record.closed,
      ...(record.savedAt === undefined ? {} : { savedAt: record.savedAt }),
      ...(record.savedRevision === undefined ? {} : { savedRevision: record.savedRevision }),
      ...(record.backupPath === undefined ? {} : { backupPath: record.backupPath }),
      ...(record.error === undefined ? {} : { error: record.error }),
    };
  }

  async function dispose() {
    disposed = true;
    await Promise.allSettled([...operations]);
    records.clear();
    locks.clear();
  }

  return { open: openDocument, source, requestSave, callback, status, activeCount, dispose };
}
