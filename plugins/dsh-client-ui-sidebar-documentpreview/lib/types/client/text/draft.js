import { textOf } from "./lines.js";
/**
 * The line-ending style of one text.
 * @param text - text as the Host returned it, terminators included.
 * @returns `crlf` when it carries a CRLF pair, `lf` otherwise.
 */
export function lineEndingsOf(text) {
    return text.includes('\r\n') ? 'crlf' : 'lf';
}
/**
 * The line count one complete text holds, in the Host's page convention: a
 * trailing newline terminates the last line rather than starting an empty one,
 * and empty text holds no lines at all.
 * @param text - the complete file text.
 * @returns how many lines it holds.
 */
export function linesIn(text) {
    if (text === '')
        return 0;
    return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}
/**
 * Open an editor over the pages a reader holds.
 * @param pages - ordered loaded pages, covering the whole file.
 * @returns the draft to show and the line-ending style to restore on save.
 */
export function draftOf(pages) {
    const read = textOf(pages);
    return { text: read.replaceAll('\r\n', '\n'), endings: lineEndingsOf(read) };
}
/**
 * Apply a file's own line-ending style to an edited draft, so a save never
 * rewrites a CRLF file as LF. CRLF pairs already in the draft are normalized
 * first, so a round trip never doubles a terminator.
 * @param text - the edited draft, LF-normalized.
 * @param endings - the style the file was read with.
 * @returns the text to send to the Host.
 */
export function restoreLineEndings(text, endings) {
    if (endings === 'lf')
        return text;
    return text.replaceAll('\r\n', '\n').split('\n').join('\r\n');
}
//# sourceMappingURL=draft.js.map