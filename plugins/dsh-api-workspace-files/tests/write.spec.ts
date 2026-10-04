/**
 * The `write` endpoint: whole-file replacement under the composed filesystem's
 * own write policy, guarded by the version the caller read.
 *
 * The guard is the point of most of these cases. A caller that presents the
 * version it read gets its text stored; a caller whose file moved on is refused
 * with the file left as it stands, because the alternative is silently
 * discarding someone else's write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FsError } from '@deepseek-ai/dsh-fs'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'
import type { WorkspaceFiles } from '../src/index.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-write-')
})

afterEach(async () => {
  await harness.dispose()
})

/** The version the Host currently reports for one workspace-relative path. */
async function versionOf(path: string, service: WorkspaceFiles = harness.endpoint()): Promise<string> {
  const current = await service.stat(harness.scope, path, signal())
  return current.version
}

describe('workspaceFiles.write — the happy path', () => {
  it('replaces the file\u2019s whole text and reports the version after the write', async () => {
    await writeFile(join(harness.workspace, 'notes.md'), 'before\n', 'utf8')
    const version = await versionOf('notes.md')
    const result = await harness.endpoint().write(harness.scope, 'notes.md', 'after\nsecond\n', version, signal())
    expect(await readFile(join(harness.workspace, 'notes.md'), 'utf8')).toBe('after\nsecond\n')
    expect(result.absolutePath).toBe(harness.ctx.fs.processPath(await harness.ctx.fs.resolve('notes.md')))
    expect(result.bytes).toBe(13)
    // The returned version is the file's current one: a second guarded write at
    // it is accepted, which is what makes the answer usable as a new baseline.
    await expect(harness.endpoint().write(harness.scope, 'notes.md', 'third\n', result.version, signal()))
      .resolves.toMatchObject({ bytes: 6 })
  })

  it('writes an empty file and writes over a nested workspace-relative path', async () => {
    await mkdir(join(harness.workspace, 'src'))
    await writeFile(join(harness.workspace, 'src', 'a.ts'), 'x', 'utf8')
    const version = await versionOf('src/a.ts')
    const result = await harness.endpoint().write(harness.scope, 'src/a.ts', '', version, signal())
    expect(await readFile(join(harness.workspace, 'src', 'a.ts'), 'utf8')).toBe('')
    expect(result.bytes).toBe(0)
  })

  it('accepts an absolute path for a file inside the workspace', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const version = await versionOf('a.txt')
    await harness.endpoint().write(harness.scope, join(harness.workspace, 'a.txt'), 'y', version, signal())
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('y')
  })

  it('resolves the sandbox policy against the live session of the scope when there is one', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const live = { id: SessionId('s-test'), header: { cwd: harness.workspace } }
    harness.sessions.live = live
    const version = await versionOf('a.txt')
    await harness.endpoint().write(harness.scope, 'a.txt', 'y', version, signal())
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('y')
  })
})

describe('workspaceFiles.write — gates', () => {
  it('refuses a version the file has moved past, leaving the file as it stands', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'mine\n', 'utf8')
    const version = await versionOf('a.txt')
    // Someone else writes between the reader's read and their save.
    await writeFile(join(harness.workspace, 'a.txt'), 'theirs\n', 'utf8')
    const failure = await failureOf(
      harness.endpoint().write(harness.scope, 'a.txt', 'mine again\n', version, signal()),
    )
    expect(failure.code).toBe('workspace-file/stale')
    expect(failure.details).toEqual({ path: 'a.txt' })
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('theirs\n')
  })

  it('reports a file that never existed as not found rather than creating it', async () => {
    const failure = await failureOf(
      harness.endpoint().write(harness.scope, 'gone.txt', 'text', 'v1', signal()),
    )
    expect(failure.code).toBe('workspace-file/not-found')
  })

  it('refuses an empty version as a bad request', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    await expect(failureOf(harness.endpoint().write(harness.scope, 'a.txt', 'y', '', signal())))
      .resolves.toMatchObject({ code: 'gateway/bad-request' })
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('x')
  })

  it('refuses an empty path as a bad request', async () => {
    await expect(failureOf(harness.endpoint().write(harness.scope, '', 'y', 'v1', signal())))
      .resolves.toMatchObject({ code: 'gateway/bad-request' })
  })

  it('refuses a directory as not a regular file', async () => {
    await mkdir(join(harness.workspace, 'dir'))
    await expect(failureOf(harness.endpoint().write(harness.scope, 'dir', 'y', 'v1', signal())))
      .resolves.toMatchObject({ code: 'workspace-file/not-regular-file', details: { path: 'dir', kind: 'directory' } })
  })

  it('refuses text over the full-file cap without touching the file', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const service = harness.endpoint({ maxFileBytes: 4 })
    const version = await versionOf('a.txt', service)
    const failure = await failureOf(service.write(harness.scope, 'a.txt', '12345', version, signal()))
    expect(failure.code).toBe('workspace-file/too-large')
    expect(failure.details).toEqual({ path: 'a.txt', limit: 4 })
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('x')
  })

  it('measures the cap in bytes rather than characters', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const service = harness.endpoint({ maxFileBytes: 5 })
    const version = await versionOf('a.txt', service)
    // Two three-byte characters are six bytes, past a five-byte cap that their
    // two characters would pass.
    await expect(failureOf(service.write(harness.scope, 'a.txt', '中文', version, signal())))
      .resolves.toMatchObject({ code: 'workspace-file/too-large' })
  })

  it.each([
    ['FS_SANDBOX_DENIED', 'workspace-file/denied'],
    ['FS_PERMISSION_DENIED', 'workspace-file/denied'],
    ['FS_NOT_REGULAR_FILE', 'workspace-file/not-regular-file'],
  ] as const)('maps a backend %s refusal onto %s', async (code, expected) => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const version = await versionOf('a.txt')
    vi.spyOn(harness.ctx.fs, 'writeText').mockRejectedValueOnce(new FsError('refused', code))
    const failure = await failureOf(harness.endpoint().write(harness.scope, 'a.txt', 'y', version, signal()))
    expect(failure.code).toBe(expected)
    expect(failure.details).toEqual(expect.objectContaining({ path: 'a.txt' }))
  })

  it('lets an unclassified backend failure travel as itself', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const version = await versionOf('a.txt')
    const raised = new Error('the disk is on fire')
    vi.spyOn(harness.ctx.fs, 'writeText').mockRejectedValueOnce(raised)
    await expect(harness.endpoint().write(harness.scope, 'a.txt', 'y', version, signal())).rejects.toBe(raised)
  })

  it('lets a coded non-filesystem failure travel as itself', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const version = await versionOf('a.txt')
    const raised = Object.assign(new Error('cancelled'), { code: 'FS_ABORTED' })
    vi.spyOn(harness.ctx.fs, 'writeText').mockRejectedValueOnce(raised)
    await expect(harness.endpoint().write(harness.scope, 'a.txt', 'y', version, signal())).rejects.toBe(raised)
  })

  it('leaves a file outside the workspace to the backend, which the local one accepts', async () => {
    const outside = join(harness.outside, 'note.txt')
    await writeFile(outside, 'x', 'utf8')
    const version = (await harness.endpoint().stat(harness.scope, outside, signal())).version
    await harness.endpoint().write(harness.scope, outside, 'y', version, signal())
    expect(await readFile(outside, 'utf8')).toBe('y')
  })
})
