/**
 * The two pure pieces of the upload gesture: encoding a dropped file's bytes
 * for the wire, and reading whatever a gesture delivered as a list of files.
 */
import { describe, expect, it } from 'vitest'
import { base64Of, filesOf } from '../src/client/upload.ts'

describe('base64Of', () => {
  it('encodes bytes as the endpoint decodes them, including NUL and high ones', () => {
    expect(base64Of(new Uint8Array())).toBe('')
    expect(base64Of(new Uint8Array([0x00, 0xff, 0x41]))).toBe('AP9B')
    expect(base64Of(new TextEncoder().encode('hi'))).toBe('aGk=')
  })

  it('round-trips a payload larger than one encoding block', () => {
    // A block is 0x8000 bytes; the second block is what a spread of the whole
    // array would have overflowed on.
    const bytes = new Uint8Array(0x8000 + 17)
    for (let at = 0; at < bytes.length; at += 1) bytes[at] = at % 256
    const decoded = Uint8Array.from(atob(base64Of(bytes)), character => character.charCodeAt(0))
    expect(decoded).toEqual(bytes)
  })
})

describe('filesOf', () => {
  it('reads a FileList as the files it holds, in order', () => {
    const first = new File(['a'], 'a.txt')
    const second = new File(['b'], 'b.txt')
    expect(filesOf([first, second] as unknown as FileList)).toEqual([first, second])
  })

  it('is empty for a gesture that carried no files at all', () => {
    expect(filesOf(null)).toEqual([])
  })
})
