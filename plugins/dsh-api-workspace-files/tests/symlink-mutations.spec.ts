/** Mutations affect a named link without moving or deleting its target. */
import { lstat, mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-symlink-')
})

afterEach(async () => {
  await harness.dispose()
})

const mutations = ['rename', 'move', 'delete'] as const

async function mutate(method: typeof mutations[number], path: string): Promise<string> {
  const endpoint = harness.endpoint()
  if (method === 'rename') return (await endpoint.rename(harness.scope, path, 'renamed', signal())).absolutePath
  if (method === 'move') {
    return (await endpoint.move(harness.scope, [path], 'destination', signal())).entries[0]!.absolutePath
  }
  return (await endpoint.delete(harness.scope, path, signal())).absolutePath
}

describe.each(mutations)('workspaceFiles.%s symlinks', (method) => {
  it.each(['inside', 'outside', 'dangling', 'directory'] as const)(
    'operates on the link to an %s target and preserves the target',
    async (kind) => {
      await mkdir(join(harness.workspace, 'destination'))
      const target = join(kind === 'outside' ? harness.outside : harness.workspace, 'target')
      if (kind === 'directory') {
        await mkdir(target)
        await writeFile(join(target, 'keep.txt'), 'preserved')
      } else if (kind !== 'dangling') {
        await writeFile(target, 'preserved')
      }
      const source = join(harness.workspace, 'link')
      await symlink(target, source, kind === 'directory' ? 'junction' : 'file')
      const linkValue = await readlink(source)

      const result = await mutate(method, source)

      await expect(lstat(source)).rejects.toMatchObject({ code: 'ENOENT' })
      if (method !== 'delete') {
        expect((await lstat(result)).isSymbolicLink()).toBe(true)
        expect(await readlink(result)).toBe(linkValue)
      }
      if (kind === 'dangling') await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
      else expect(await readFile(kind === 'directory' ? join(target, 'keep.txt') : target, 'utf8')).toBe('preserved')
    },
  )

  it('refuses an outside link even when its target is inside the workspace', async () => {
    await mkdir(join(harness.workspace, 'destination'))
    const target = join(harness.workspace, 'keep.txt')
    const source = join(harness.outside, 'link')
    await writeFile(target, 'preserved')
    await symlink(target, source, 'file')

    expect((await failureOf(mutate(method, source))).code).toBe('workspace-file/outside-workspace')
    expect((await lstat(source)).isSymbolicLink()).toBe(true)
    expect(await readFile(target, 'utf8')).toBe('preserved')
  })

  it('refuses a source beneath a parent link that leaves the workspace', async () => {
    await mkdir(join(harness.workspace, 'destination'))
    await symlink(harness.outside, join(harness.workspace, 'escape'), 'junction')
    await writeFile(join(harness.outside, 'keep.txt'), 'preserved')

    expect((await failureOf(mutate(method, 'escape/keep.txt'))).code).toBe('workspace-file/outside-workspace')
    expect(await readFile(join(harness.outside, 'keep.txt'), 'utf8')).toBe('preserved')
  })
})
