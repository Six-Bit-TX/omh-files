/**
 * The editor's text arithmetic: what a draft opens with, how many lines a saved
 * text holds in the Host's convention, and how the file's own line endings come
 * back on the way out.
 */
import { describe, expect, it } from 'vitest'
import {
  draftOf,
  lineEndingsOf,
  linesIn,
  restoreLineEndings,
} from '../src/client/text/draft.ts'
import type { LoadedPage } from '../src/client/text/lines.ts'

const pages = (...held: LoadedPage[]): LoadedPage[] => held

describe('lineEndingsOf', () => {
  it('reports CRLF for a file carrying a CRLF pair and LF otherwise', () => {
    expect(lineEndingsOf('a\r\nb')).toBe('crlf')
    expect(lineEndingsOf('a\nb')).toBe('lf')
    expect(lineEndingsOf('')).toBe('lf')
    // A lone carriage return is not a terminator this reader recognizes.
    expect(lineEndingsOf('a\rb')).toBe('lf')
  })
})

describe('linesIn', () => {
  it('counts lines the way the Host does: a trailing newline terminates rather than opens', () => {
    expect(linesIn('')).toBe(0)
    expect(linesIn('a')).toBe(1)
    expect(linesIn('a\n')).toBe(1)
    expect(linesIn('a\nb')).toBe(2)
    expect(linesIn('a\nb\n')).toBe(2)
    expect(linesIn('a\n\n')).toBe(2)
    expect(linesIn('\n')).toBe(1)
  })
})

describe('draftOf', () => {
  it('opens on the loaded text with its CRLF pairs normalized, and remembers the style', () => {
    expect(draftOf(pages({ offset: 1, text: 'a\nb', lines: 2 })))
      .toEqual({ text: 'a\nb', endings: 'lf' })
    expect(draftOf(pages({ offset: 1, text: 'a\r\nb', lines: 2 })))
      .toEqual({ text: 'a\nb', endings: 'crlf' })
  })

  it('joins ordered pages and lets a zero-line page contribute nothing', () => {
    expect(draftOf(pages({ offset: 1, text: 'a', lines: 1 }, { offset: 2, text: '', lines: 0 })))
      .toEqual({ text: 'a', endings: 'lf' })
    expect(draftOf(pages()))
      .toEqual({ text: '', endings: 'lf' })
  })
})

describe('restoreLineEndings', () => {
  it('leaves an LF file alone', () => {
    expect(restoreLineEndings('a\nb', 'lf')).toBe('a\nb')
  })

  it('re-terminates a CRLF file\u2019s lines without doubling a pair already there', () => {
    expect(restoreLineEndings('a\nb', 'crlf')).toBe('a\r\nb')
    expect(restoreLineEndings('a\r\nb', 'crlf')).toBe('a\r\nb')
    expect(restoreLineEndings('a\n', 'crlf')).toBe('a\r\n')
    expect(restoreLineEndings('', 'crlf')).toBe('')
  })
})
