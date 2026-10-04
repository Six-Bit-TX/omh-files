/**
 * What an edit starts from and what a save sends back.
 *
 * A browser text field holds line breaks as LF, so a CRLF file cannot be edited
 * in place without either marking every reader dirty the moment they type or
 * rewriting the whole file as LF on save. The draft is therefore the loaded
 * text with its line endings normalized, and the style it was read with travels
 * beside it to be restored on the way out.
 */
import type { LoadedPage } from './lines.ts'
import { textOf } from './lines.ts'

/** The line-ending style one file was read with. */
export type LineEndings = 'lf' | 'crlf'

/** One editor's opening state: the text to show and the style to restore on save. */
export interface Draft {
  /** The loaded text with every CRLF pair normalized to LF, as a text field holds it. */
  readonly text: string
  /** The style the file was read with. */
  readonly endings: LineEndings
}

/**
 * The line-ending style of one text.
 * @param text - text as the Host returned it, terminators included.
 * @returns `crlf` when it carries a CRLF pair, `lf` otherwise.
 */
export function lineEndingsOf(text: string): LineEndings {
  return text.includes('\r\n') ? 'crlf' : 'lf'
}

/**
 * The line count one complete text holds, in the Host's page convention: a
 * trailing newline terminates the last line rather than starting an empty one,
 * and empty text holds no lines at all.
 * @param text - the complete file text.
 * @returns how many lines it holds.
 */
export function linesIn(text: string): number {
  if (text === '') return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

/**
 * Open an editor over the pages a reader holds.
 * @param pages - ordered loaded pages, covering the whole file.
 * @returns the draft to show and the line-ending style to restore on save.
 */
export function draftOf(pages: readonly LoadedPage[]): Draft {
  const read = textOf(pages)
  return { text: read.replaceAll('\r\n', '\n'), endings: lineEndingsOf(read) }
}

/**
 * Apply a file's own line-ending style to an edited draft, so a save never
 * rewrites a CRLF file as LF. CRLF pairs already in the draft are normalized
 * first, so a round trip never doubles a terminator.
 * @param text - the edited draft, LF-normalized.
 * @param endings - the style the file was read with.
 * @returns the text to send to the Host.
 */
export function restoreLineEndings(text: string, endings: LineEndings): string {
  if (endings === 'lf') return text
  return text.replaceAll('\r\n', '\n').split('\n').join('\r\n')
}
