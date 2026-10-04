/** The `move` endpoint: entries relocated inside the workspace, validated before the first one moves. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-move-')
})

afterEach(async () => {
  await harness.dispose()
})

/** The absolute path a direct call answers with for a path the backend resolves. */
async function absoluteOf(path: string): Promise<string> {
  return harness.ctx.fs.processPath(await harness.ctx.fs.resolve(path))
}

describe('workspaceFiles.move — the happy path', () => {
  it('moves one file into a subdirectory and reports both ends', async () => {
    await mkdir(join(harness.workspace, 'archive'))
    await writeFile(join(harness.workspace, 'a.txt'), 'content', 'utf8')
    const result = await harness.endpoint().move(harness.scope, ['a.txt'], 'archive', signal())
    expect(result.destination).toBe(await absoluteOf(join(harness.workspace, 'archive')))
    expect(result.entries).toEqual([{
      from: await absoluteOf(join(harness.workspace, 'a.txt')),
      absolutePath: await absoluteOf(join(harness.workspace, 'archive', 'a.txt')),
    }])
    expect(await readFile(join(harness.workspace, 'archive', 'a.txt'), 'utf8')).toBe('content')
    await expect(stat(join(harness.workspace, 'a.txt'))).rejects.toThrow()
  })

  it('moves a whole selection, including a directory with everything below it', async () => {
    await mkdir(join(harness.workspace, 'target'))
    await mkdir(join(harness.workspace, 'src', 'nested'), { recursive: true })
    await writeFile(join(harness.workspace, 'src', 'nested', 'a.ts'), 'x', 'utf8')
    await writeFile(join(harness.workspace, 'b.txt'), 'b', 'utf8')
    const result = await harness.endpoint().move(
      harness.scope,
      [join(harness.workspace, 'src'), 'b.txt'],
      join(harness.workspace, 'target'),
      signal(),
    )
    expect(result.entries.map(entry => entry.absolutePath)).toEqual([
      await absoluteOf(join(harness.workspace, 'target', 'src')),
      await absoluteOf(join(harness.workspace, 'target', 'b.txt')),
    ])
    expect(await readFile(join(harness.workspace, 'target', 'src', 'nested', 'a.ts'), 'utf8')).toBe('x')
    expect(await readFile(join(harness.workspace, 'target', 'b.txt'), 'utf8')).toBe('b')
  })

  it('leaves an entry that is already in the destination where it is, reporting it in place', async () => {
    await mkdir(join(harness.workspace, 'target'))
    await writeFile(join(harness.workspace, 'target', 'a.txt'), 'content', 'utf8')
    const absolute = await absoluteOf(join(harness.workspace, 'target', 'a.txt'))
    const result = await harness.endpoint().move(harness.scope, ['target/a.txt'], 'target/', signal())
    expect(result.destination).toBe(await absoluteOf(join(harness.workspace, 'target')))
    expect(result.entries).toEqual([{ from: absolute, absolutePath: absolute }])
    expect(await readFile(join(harness.workspace, 'target', 'a.txt'), 'utf8')).toBe('content')
  })
})

describe('workspaceFiles.move — gates', () => {
  it('refuses an empty selection as a bad request', async () => {
    const failure = await failureOf(harness.endpoint().move(harness.scope, [], '.', signal()))
    expect(failure.code).toBe('gateway/bad-request')
  })

  it('refuses a destination that is not a directory, naming its kind', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    await writeFile(join(harness.workspace, 'b.txt'), 'y', 'utf8')
    const failure = await failureOf(harness.endpoint().move(harness.scope, ['a.txt'], 'b.txt', signal()))
    expect(failure).toEqual({ code: 'workspace-file/not-directory', details: { path: 'b.txt', kind: 'file' } })
  })

  it('reports a missing destination and a missing source as not found', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    expect((await failureOf(harness.endpoint().move(harness.scope, ['a.txt'], 'nope', signal()))).code)
      .toBe('workspace-file/not-found')
    expect((await failureOf(harness.endpoint().move(harness.scope, ['nope.txt'], '.', signal()))).code)
      .toBe('workspace-file/not-found')
  })

  it('refuses a destination outside the workspace', async () => {
    await writeFile(join(harness.workspace, 'a.txt'), 'x', 'utf8')
    const failure = await failureOf(harness.endpoint().move(harness.scope, ['a.txt'], harness.outside, signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('x')
  })

  it('refuses a source outside the workspace', async () => {
    await mkdir(join(harness.workspace, 'target'))
    await writeFile(join(harness.outside, 'secret.txt'), 'x', 'utf8')
    const failure = await failureOf(
      harness.endpoint().move(harness.scope, [join(harness.outside, 'secret.txt')], 'target', signal()),
    )
    expect(failure.code).toBe('workspace-file/outside-workspace')
    expect(await readFile(join(harness.outside, 'secret.txt'), 'utf8')).toBe('x')
  })

  it('refuses the workspace root', async () => {
    await mkdir(join(harness.workspace, 'target'))
    const failure = await failureOf(
      harness.endpoint().move(harness.scope, [harness.workspace], join(harness.workspace, 'target'), signal()),
    )
    expect(failure.code).toBe('gateway/bad-request')
    expect(await stat(harness.workspace)).toBeDefined()
  })

  it('refuses moving a directory into itself and into its own subtree', async () => {
    await mkdir(join(harness.workspace, 'src', 'nested'), { recursive: true })
    await writeFile(join(harness.workspace, 'src', 'nested', 'a.ts'), 'x', 'utf8')
    expect((await failureOf(harness.endpoint().move(harness.scope, ['src'], 'src', signal()))).code)
      .toBe('gateway/bad-request')
    expect((await failureOf(harness.endpoint().move(harness.scope, ['src'], 'src/nested', signal()))).code)
      .toBe('gateway/bad-request')
    expect(await readFile(join(harness.workspace, 'src', 'nested', 'a.ts'), 'utf8')).toBe('x')
  })

  it('refuses a destination name already taken, leaving the source where it was', async () => {
    await mkdir(join(harness.workspace, 'target'))
    await writeFile(join(harness.workspace, 'a.txt'), 'from', 'utf8')
    await writeFile(join(harness.workspace, 'target', 'a.txt'), 'to', 'utf8')
    const failure = await failureOf(harness.endpoint().move(harness.scope, ['a.txt'], 'target', signal()))
    expect(failure.code).toBe('workspace-file/exists')
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('from')
    expect(await readFile(join(harness.workspace, 'target', 'a.txt'), 'utf8')).toBe('to')
  })

  it('refuses a selection whose entries would land on one name', async () => {
    await mkdir(join(harness.workspace, 'one'))
    await mkdir(join(harness.workspace, 'two'))
    await mkdir(join(harness.workspace, 'target'))
    await writeFile(join(harness.workspace, 'one', 'a.txt'), '1', 'utf8')
    await writeFile(join(harness.workspace, 'two', 'a.txt'), '2', 'utf8')
    const failure = await failureOf(
      harness.endpoint().move(harness.scope, ['one/a.txt', 'two/a.txt'], 'target', signal()),
    )
    expect(failure.code).toBe('workspace-file/exists')
    expect(await readFile(join(harness.workspace, 'one', 'a.txt'), 'utf8')).toBe('1')
    expect(await readFile(join(harness.workspace, 'two', 'a.txt'), 'utf8')).toBe('2')
  })

  it('validates the whole selection before moving anything', async () => {
    await mkdir(join(harness.workspace, 'target'))
    await writeFile(join(harness.workspace, 'a.txt'), 'first', 'utf8')
    await writeFile(join(harness.workspace, 'target', 'b.txt'), 'taken', 'utf8')
    const failure = await failureOf(
      harness.endpoint().move(harness.scope, ['a.txt', 'nope.txt'], 'target', signal()),
    )
    expect(failure.code).toBe('workspace-file/not-found')
    expect(await readFile(join(harness.workspace, 'a.txt'), 'utf8')).toBe('first')
    await expect(stat(join(harness.workspace, 'target', 'a.txt'))).rejects.toThrow()
  })
})
