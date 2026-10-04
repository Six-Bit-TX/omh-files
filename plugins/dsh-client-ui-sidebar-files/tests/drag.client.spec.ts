// @vitest-environment jsdom
/**
 * Dragging the tree's own rows: what the payload carries, and which of those
 * rows a drop would actually move.
 *
 * The payload is what tells this tree's drag from OS files arriving on the same
 * target, so a payload this module did not write must decode to nothing rather
 * than to a move. The filter is the other half: a drop that could only move an
 * entry onto itself, onto where it already is, or onto a directory one of its own
 * ancestors already carries sends no request at all.
 */
import { describe, expect, it } from 'vitest'
import { decodeDragPaths, encodeDragPaths, FILES_DRAG_MIME, movablePaths } from '../src/client/drag.ts'

describe('drag payloads', () => {
  it('round-trips the paths one drag carries', () => {
    const paths = ['/work/app/a.ts', '/work/app/src']
    const payload = encodeDragPaths(paths)
    expect(JSON.parse(payload)).toEqual({ paths })
    expect(decodeDragPaths(payload)).toEqual(paths)
  })

  it('decodes to nothing for a payload this tree did not write', () => {
    expect(decodeDragPaths('')).toEqual([])
    expect(decodeDragPaths('not json')).toEqual([])
    expect(decodeDragPaths('{"paths":"a.ts"}')).toEqual([])
    expect(decodeDragPaths('{"other":[1]}')).toEqual([])
    expect(decodeDragPaths('{"paths":["a.ts",7,null,""]}')).toEqual(['a.ts'])
  })

  it('tells its own drag type apart from the browser\'s file drag', () => {
    expect(FILES_DRAG_MIME).toBe('application/x-dsh-workspace-files+json')
  })

  it('propagates a failure that is not a malformed payload', () => {
    const throwing = { toString: () => { throw new RangeError('unreadable') } } as unknown as string
    expect(() => decodeDragPaths(throwing)).toThrow(RangeError)
  })
})

describe('movablePaths', () => {
  it('keeps what a drop on another directory would move, in the order it was dragged', () => {
    expect(movablePaths(['/work/app/a.ts', '/work/app/b.ts'], '/work/app/archive'))
      .toEqual(['/work/app/a.ts', '/work/app/b.ts'])
  })

  it('drops an entry already in the destination, and the destination itself', () => {
    expect(movablePaths(['/work/app/a.ts'], '/work/app')).toEqual([])
    expect(movablePaths(['/work/app/archive'], '/work/app/archive')).toEqual([])
  })

  it('drops an entry another dragged directory already carries, and repeats of one path', () => {
    expect(movablePaths(['/work/app/src', '/work/app/src/a.ts', '/work/app/src'], '/work/app/archive'))
      .toEqual(['/work/app/src'])
    expect(movablePaths(['/work/app/a.ts', '/work/app/a.ts'], '/work/app/archive')).toEqual(['/work/app/a.ts'])
  })

  it('reads the separators a Host-reported path may carry', () => {
    expect(movablePaths(['C:\\work\\a.ts'], 'C:\\work')).toEqual([])
    expect(movablePaths(['C:\\work\\src', 'C:\\work\\src\\a.ts'], 'C:\\work\\archive')).toEqual(['C:\\work\\src'])
  })
})
