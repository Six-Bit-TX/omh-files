/**
 * The `upload` endpoint: one new file created from exact bytes.
 *
 * An upload always guards with `createIfAbsent`, so its whole question is what
 * the target already is. A free name is created with the bytes the caller sent,
 * byte for byte; a taken name is refused and left alone, because replacing a
 * file is a decision the reader makes elsewhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, stat as statPath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FsError } from '@deepseek-ai/dsh-fs'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'
import type { WorkspaceFiles } from '../src/index.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-upload-')
})

afterEach(async () => {
  await harness.dispose()
})

/** The payload one upload carries, in the base64 the wire uses. */
const encoded = (...bytes: number[]): string => Buffer.from(bytes).toString('base64')

describe('workspaceFiles.upload — the happy path', () => {
  it('creates a new file with the exact bytes', async () => {
    const result = await harness.endpoint().upload(harness.scope, 'blob.bin', encoded(0, 255, 128, 65), signal())
    expect(new Uint8Array(await readFile(join(harness.workspace, 'blob.bin')))).toEqual(new Uint8Array([0, 255, 128, 65]))
    expect(result.absolutePath).toBe(harness.ctx.fs.processPath(await harness.ctx.fs.resolve('blob.bin')))
    expect(result.bytes).toBe(4)
    expect(result.version).toBe((await statPath(join(harness.workspace, 'blob.bin'))).size.toString().length > 0
      ? (await harness.endpoint().stat(harness.scope, 'blob.bin', signal())).version
      : '')
  })

  it('creates an empty file and a file in a nested workspace-relative directory', async () => {
    await mkdir(join(harness.workspace, 'src'))
    const empty = await harness.endpoint().upload(harness.scope, 'src/empty.txt', '', signal())
    expect(empty.bytes).toBe(0)
    expect(await readFile(join(harness.workspace, 'src', 'empty.txt'), 'utf8')).toBe('')

    const nested = await harness.endpoint().upload(harness.scope, 'src/deep/new.md', encoded(35), signal())
    expect(nested.bytes).toBe(1)
    expect(await readFile(join(harness.workspace, 'src', 'deep', 'new.md'), 'utf8')).toBe('#')
  })

  it('accepts an absolute path for a file inside the workspace', async () => {
    const path = join(harness.workspace, 'abs.txt')
    await harness.endpoint().upload(harness.scope, path, encoded(65), signal())
    expect(await readFile(path, 'utf8')).toBe('A')
  })

  it('reports the created file through stat, so a reader can page it immediately', async () => {
    await harness.endpoint().upload(harness.scope, 'readable.txt', Buffer.from('hello\n').toString('base64'), signal())
    const page = await harness.endpoint().read(harness.scope, 'readable.txt', {}, signal())
    expect(page.text).toBe('hello')
    expect(page.lines).toBe(1)
  })
})

describe('workspaceFiles.upload — gates', () => {
  it('refuses a name that is already taken, leaving that file alone', async () => {
    await writeFile(join(harness.workspace, 'taken.txt'), 'theirs', 'utf8')
    const failure = await failureOf(harness.endpoint().upload(harness.scope, 'taken.txt', encoded(1), signal()))
    expect(failure.code).toBe('workspace-file/exists')
    expect(failure.details).toEqual({ path: 'taken.txt' })
    expect(await readFile(join(harness.workspace, 'taken.txt'), 'utf8')).toBe('theirs')
  })

  it('refuses a directory of that name as not a regular file', async () => {
    await mkdir(join(harness.workspace, 'adir'))
    await expect(failureOf(harness.endpoint().upload(harness.scope, 'adir', encoded(1), signal())))
      .resolves.toMatchObject({ code: 'workspace-file/not-regular-file', details: { path: 'adir' } })
  })

  it('refuses a payload over the full-file cap without creating anything', async () => {
    const service = harness.endpoint({ maxFileBytes: 4 })
    const failure = await failureOf(service.upload(harness.scope, 'big.bin', encoded(1, 2, 3, 4, 5), signal()))
    expect(failure.code).toBe('workspace-file/too-large')
    expect(failure.details).toEqual({ path: 'big.bin', limit: 4 })
    await expect(statPath(join(harness.workspace, 'big.bin'))).rejects.toThrow()
  })

  it.each(['!!!!', 'AAAA AAAA', 'AA=A', 'AP9=AP9=', 'A', 'AP9', 'not base64 at all'])(
    'refuses %j as a bad request rather than decoding it',
    async (data) => {
      await expect(failureOf(harness.endpoint().upload(harness.scope, 'x.bin', data, signal())))
        .resolves.toMatchObject({ code: 'gateway/bad-request' })
      await expect(statPath(join(harness.workspace, 'x.bin'))).rejects.toThrow()
    },
  )

  it.each(['', 'dir/', 'dir/.', 'dir/..', 'dir\\..'])('refuses path %j as a bad request', async (path) => {
    await expect(failureOf(harness.endpoint().upload(harness.scope, path, encoded(1), signal())))
      .resolves.toMatchObject({ code: 'gateway/bad-request' })
  })

  it.each([
    ['FS_SANDBOX_DENIED', 'workspace-file/denied'],
    ['FS_PERMISSION_DENIED', 'workspace-file/denied'],
    ['FS_NOT_REGULAR_FILE', 'workspace-file/not-regular-file'],
    ['FS_STALE_VERSION', 'workspace-file/stale'],
  ] as const)('maps a backend %s refusal onto %s', async (code, expected) => {
    vi.spyOn(harness.ctx.fs, 'writeBytes').mockRejectedValueOnce(new FsError('refused', code))
    const failure = await failureOf(harness.endpoint().upload(harness.scope, 'x.bin', encoded(1), signal()))
    expect(failure.code).toBe(expected)
    expect(failure.details).toEqual(expect.objectContaining({ path: 'x.bin' }))
  })

  it('lets an unclassified backend failure travel as itself', async () => {
    const raised = new Error('the disk is on fire')
    vi.spyOn(harness.ctx.fs, 'writeBytes').mockRejectedValueOnce(raised)
    await expect(harness.endpoint().upload(harness.scope, 'x.bin', encoded(1), signal())).rejects.toBe(raised)
  })

  it('writes under the policy the Session resolves', async () => {
    const service: WorkspaceFiles = harness.endpoint()
    const writeBytes = vi.spyOn(harness.ctx.fs, 'writeBytes')
    harness.sessions.live = { id: harness.scope.sessionId, header: { cwd: harness.workspace } }
    await service.upload(harness.scope, 'x.bin', encoded(1), signal())
    const [target, content, intent, , policy] = writeBytes.mock.calls[0] ?? []
    expect(target).toMatchObject({ displayPath: join(harness.workspace, 'x.bin') })
    expect(Array.from(content ?? [])).toEqual([1])
    expect(intent).toEqual({ kind: 'createIfAbsent' })
    expect(policy).toEqual({ mode: 'workspace-write', workspaceRoot: harness.workspace })
  })
})
