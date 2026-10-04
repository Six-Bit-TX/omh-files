/** Render a byte count the way a person reads one. */
function humanBytes(bytes) {
    if (bytes >= 1024 * 1024)
        return `${Math.round(bytes / (1024 * 1024))} MB`;
    if (bytes >= 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}
/**
 * Say what went wrong, in terms of the file rather than of the transport.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show in place of the file.
 */
export function failureLine(t, failure) {
    switch (failure.code) {
        case 'workspace-file/not-found': return t('error.notFound');
        case 'workspace-file/too-large':
            return t('error.tooLarge', { limit: humanBytes(failure.details.limit) });
        case 'workspace-file/not-text': return t('error.notText');
        case 'workspace-file/not-regular-file': return t('error.notRegularFile');
        // Carrier and unclassified host failures reach the reader as themselves:
        // this panel knows nothing useful to add to a transport-level message.
        default: return t('error.unavailable', { message: failure.message });
    }
}
/**
 * Say why a save was refused. A save meets the read vocabulary — the file can
 * be gone or over a limit — plus two refusals only a write can produce, and its
 * size line names the write's cap rather than a page's.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show beside the editor.
 */
export function saveFailureLine(t, failure) {
    switch (failure.code) {
        case 'workspace-file/stale': return t('error.stale');
        case 'workspace-file/denied': return t('error.denied');
        case 'workspace-file/too-large':
            return t('error.writeTooLarge', { limit: humanBytes(failure.details.limit) });
        default: return failureLine(t, failure);
    }
}
//# sourceMappingURL=failure-line.js.map