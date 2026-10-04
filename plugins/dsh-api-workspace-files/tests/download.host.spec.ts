/**
 * `/api/workspace.download`: the browser's own read of one workspace file.
 *
 * What is asserted is the carrier's contract rather than a Remote answer's: a
 * GET enumerates the file in configured windows and names it as an attachment,
 * a HEAD answers the same headers with no body, a refusal is a status with no
 * Host path in it, and the file itself has no size cap — the whole point of the
 * route, since `readAll` refuses anything above `maxFileBytes`. The two pure
 * helpers it is built from are checked on their own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FsInfo } from '@deepseek-ai/dsh-fs'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { BrowserAuth } from '@deepseek-ai/dsh-client-connection/src/browser-auth.ts'
import type { ConnectionFetchHandler } from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { byteStream, contentDisposition, downloadStatus, WORKSPACE_DOWNLOAD_PATH } from '../src/download.ts'
import { openWorkspace, type Harness } from './harness.ts'

/** One window of a downloaded file; small so a short file still spans several. */
const WINDOW_BYTES = 8

let harness: Harness
let api: ConnectionFetchHandler

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-download-')
  // The route registers itself against whatever connection service the runtime
  // mounts; this stands in for the Web carrier's own, and the fetch handler is
  // called directly, exactly as the `/api` prefix route calls it after its
  // Host/Origin fence and browser authentication.
  const connection = new HostConnectionService(harness.ctx, [], {} as BrowserAuth)
  harness.sessions.live = { header: { cwd: harness.workspace } }
  harness.endpoint({ maxBytes: WINDOW_BYTES })
  // The registration rides an inject wait on a service that already exists.
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  api = connection.createSharedFetchHandler('/api')
})

afterEach(async () => {
  await harness.dispose()
})

/** One download request for `path` under the harness Session. */
function request(path: string, init: RequestInit = {}): Request {
  const url = new URL(`http://host${WORKSPACE_DOWNLOAD_PATH}`)
  url.searchParams.set('sessionId', String(SessionId('s-test')))
  url.searchParams.set('path', path)
  return new Request(url, init)
}

/** The bytes of one settled response. */
async function bodyOf(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer())
}

describe('workspaceFiles download route', () => {
  it('streams one file as an attachment under its own name and length', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'hello download', 'utf8')
    const response = await api.fetch(request('a.txt'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="a.txt"; filename*=UTF-8\'\'a.txt')
    expect(response.headers.get('content-length')).toBe('14')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(new TextDecoder().decode(await bodyOf(response))).toBe('hello download')
  })

  it('reads a file larger than the window in windows and returns it whole', async () => {
    const content = 'abcdefghijklmnopqrstuvwxyz0123456789'
    await writeFile(join(harness.workspace, 'big.bin'), content, 'utf8')
    const windows: number[] = []
    const read = harness.ctx.fs.readByteRange.bind(harness.ctx.fs)
    const spy = vi.spyOn(harness.ctx.fs, 'readByteRange').mockImplementation(async (target, range, signal) => {
      windows.push(range.length)
      return read(target, range, signal)
    })
    const response = await api.fetch(request('big.bin'))
    expect(new TextDecoder().decode(await bodyOf(response))).toBe(content)
    expect(response.headers.get('content-length')).toBe(String(content.length))
    // Four full windows for 36 bytes at 8, then the terminal empty one.
    expect(windows).toEqual([WINDOW_BYTES, WINDOW_BYTES, WINDOW_BYTES, WINDOW_BYTES, WINDOW_BYTES])
    spy.mockRestore()
  })

  it('answers a HEAD preflight with the same headers and no body', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'hello', 'utf8')
    const response = await api.fetch(request('a.txt', { method: 'HEAD' }))
    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
    expect(response.headers.get('content-length')).toBe('5')
    expect(response.headers.get('content-disposition')).toContain('a.txt')
  })

  it('names a file outside the workspace by its own basename, since reads reach beyond the root', async () => {
    await writeFile(join(harness.outside, 'outside.txt'), 'kept', 'utf8')
    const response = await api.fetch(request(join(harness.outside, 'outside.txt')))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('outside.txt')
    expect(new TextDecoder().decode(await bodyOf(response))).toBe('kept')
  })

  it.each([
    ['a missing sessionId', (url: URL) => { url.searchParams.delete('sessionId') }],
    ['an empty sessionId', (url: URL) => { url.searchParams.set('sessionId', '') }],
    ['a missing path', (url: URL) => { url.searchParams.delete('path') }],
    ['an empty path', (url: URL) => { url.searchParams.set('path', '') }],
  ])('refuses %s as a bad request', async (_name, mutate) => {
    const url = new URL(`http://host${WORKSPACE_DOWNLOAD_PATH}`)
    url.searchParams.set('sessionId', String(SessionId('s-test')))
    url.searchParams.set('path', 'a.txt')
    mutate(url)
    const response = await api.fetch(new Request(url))
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('sessionId and path are required')
  })

  it('answers 404 for a session no header knows', async () => {
    const url = new URL(`http://host${WORKSPACE_DOWNLOAD_PATH}`)
    url.searchParams.set('sessionId', String(SessionId('s-other')))
    url.searchParams.set('path', 'a.txt')
    harness.sessions.live = undefined
    const response = await api.fetch(new Request(url))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('session not found')
  })

  it('maps a missing file to 404 and a directory to 403 without naming a Host path', async () => {
    await mkdir(join(harness.workspace, 'src'))
    const missing = await api.fetch(request('nope.txt'))
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('download refused with status 404')
    const directory = await api.fetch(request('src'))
    expect(directory.status).toBe(403)
    expect(await directory.text()).toBe('download refused with status 403')
  })

  it('answers a refused HEAD with the status and no body', async () => {
    const response = await api.fetch(request('nope.txt', { method: 'HEAD' }))
    expect(response.status).toBe(404)
    expect(response.body).toBeNull()
  })

  it('streams a file whose backend reports no size, closing on the short window', async () => {
    await writeFile(join(harness.workspace, 'sizeless.txt'), 'unsized', 'utf8')
    // A backend that reports a version and a kind but no byte size: the route
    // then carries no length and the stream ends at its first short window.
    const stat = vi.spyOn(harness.ctx.fs, 'stat')
      .mockResolvedValue({ version: 'v1' as FsInfo['version'], type: 'file' })
    const response = await api.fetch(request('sizeless.txt'))
    expect(response.headers.get('content-length')).toBeNull()
    expect(new TextDecoder().decode(await bodyOf(response))).toBe('unsized')
    stat.mockRestore()
  })

  it('reads a workspace-relative path against the session root', async () => {
    await mkdir(join(harness.workspace, 'src'))
    await writeFile(join(harness.workspace, 'src', 'a.txt'), 'relative', 'utf8')
    const response = await api.fetch(request('src/a.txt'))
    expect(new TextDecoder().decode(await bodyOf(response))).toBe('relative')
  })
})

describe('contentDisposition', () => {
  it('carries an ASCII name in both forms', () => {
    expect(contentDisposition('report.pdf'))
      .toBe('attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf')
  })

  it('strips the quoting and control characters a quoted string cannot carry', () => {
    expect(contentDisposition('od"d\\name')).toBe('attachment; filename="od_d_name"; filename*=UTF-8\'\'od%22d%5Cname')
  })

  it('keeps a non-ASCII name in the RFC 5987 form and falls back for the quoted one', () => {
    expect(contentDisposition('设计.png'))
      .toBe('attachment; filename="__.png"; filename*=UTF-8\'\'%E8%AE%BE%E8%AE%A1.png')
  })

  it('escapes the attribute characters encodeURIComponent leaves alone', () => {
    expect(contentDisposition("a'()*b.txt"))
      .toBe('attachment; filename="a\'()*b.txt"; filename*=UTF-8\'\'a%27%28%29%2Ab.txt')
  })
})

describe('downloadStatus', () => {
  it('maps both error vocabularies to the status the route answers with', () => {
    expect(downloadStatus('workspace-file/not-found')).toBe(404)
    expect(downloadStatus('FS_NOT_FOUND')).toBe(404)
    for (const code of [
      'workspace-file/not-regular-file',
      'workspace-file/outside-workspace',
      'FS_NOT_REGULAR_FILE',
      'FS_PERMISSION_DENIED',
      'FS_SANDBOX_DENIED',
    ]) {
      expect(downloadStatus(code)).toBe(403)
    }
    expect(downloadStatus('gateway/bad-request')).toBe(400)
    expect(downloadStatus('FS_ABORTED')).toBe(499)
    expect(downloadStatus('workspace-file/not-text')).toBe(500)
    expect(downloadStatus(undefined)).toBe(500)
  })
})

describe('byteStream', () => {
  /** Collect a stream's chunks. */
  async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) chunks.push(chunk)
    return chunks
  }

  it('ends a size-less read at the first short window', async () => {
    const windows = [new Uint8Array([1, 2]), new Uint8Array([3])]
    const chunks = await collect(byteStream(
      async () => windows.shift() ?? new Uint8Array(0),
      undefined,
      2,
    ))
    expect(chunks.map(chunk => [...chunk])).toEqual([[1, 2], [3]])
  })

  it('ends at the size a stat reported, without reading past it', async () => {
    let calls = 0
    const chunks = await collect(byteStream(
      async (offset) => {
        calls += 1
        return new Uint8Array(offset < 4 ? [1, 2] : [])
      },
      4,
      2,
    ))
    expect(chunks).toHaveLength(2)
    expect(calls).toBe(2)
  })

  it('closes at once when the backend reports nothing left', async () => {
    expect(await collect(byteStream(async () => new Uint8Array(0), undefined, 2))).toEqual([])
  })

  it('errors rather than truncating when a window read fails', async () => {
    const stream = byteStream(async () => { throw new Error('disk gone') }, undefined, 2)
    await expect(collect(stream)).rejects.toThrow('disk gone')
  })

  it('stops asking once a request aborts through the reader it was given', async () => {
    const controller = new AbortController()
    const stream = byteStream(async () => {
      controller.abort()
      return new Uint8Array([1])
    }, undefined, 2)
    const chunks = await collect(stream)
    expect(chunks).toHaveLength(1)
  })
})
