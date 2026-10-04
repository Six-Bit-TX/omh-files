/**
 * The browser download route: one workspace file handed to the browser as a
 * stream, so a download is bounded by no complete-file cap.
 *
 * A Remote answer carries one base64 window that the whole JSON-RPC envelope
 * must hold, which is why `readAll` refuses a file above `maxFileBytes`. A
 * download instead travels over the browser's own HTTP carrier: the route reads
 * the file one `maxBytes` window at a time through `ctx.fs` and enumerates them
 * into the response, so the Host never holds the file and the browser writes it
 * straight to disk. The route lives under the `/api` channel, so the connection
 * service's Host/Origin fence and browser authentication run before the handler.
 *
 * @module @deepseek-ai/dsh-api-workspace-files/download
 */
/** The exact `/api` route a browser download reads. */
export const WORKSPACE_DOWNLOAD_PATH = '/api/workspace.download';
/**
 * Headers every download answer carries.
 *
 * `octet-stream` is deliberate whatever the file is: the answer is an
 * attachment, never something a browser may render from the API origin.
 */
export const DOWNLOAD_HEADERS = {
    'content-type': 'application/octet-stream',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
};
/** One RFC 5987 `attr-char` escape: the characters `encodeURIComponent` leaves that a token cannot carry. */
const ATTR_CHAR_ESCAPE = /['()*]/gu;
/**
 * The `Content-Disposition` value that saves one file under its own name.
 *
 * The quoted `filename` carries an ASCII-only fallback and `filename*` the real
 * name, so a name outside ASCII survives on a browser that reads RFC 5987 and
 * degrades to a readable stand-in on one that does not.
 * @param name - the file's basename.
 * @returns the header value.
 */
export function contentDisposition(name) {
    const fallback = name.replace(/[^\u0020-\u007e]/gu, '_').replace(/["\\]/gu, '_');
    const encoded = encodeURIComponent(name).replace(ATTR_CHAR_ESCAPE, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
/**
 * The HTTP status one refused download answers with, from the code the failure
 * carries.
 *
 * Both vocabularies a read can raise are read the same way, by their code
 * value: this service's own `RemoteError` codes and the filesystem backend's
 * `FsError` codes never overlap, and neither class identity crosses the package
 * boundary. An unclassified failure is a `500`, because nothing here knows
 * anything more useful to say about it.
 * @param code - the failure's code, whatever kind of error carried it.
 * @returns the status to answer with.
 */
export function downloadStatus(code) {
    switch (code) {
        case 'workspace-file/not-found':
        case 'FS_NOT_FOUND':
            return 404;
        case 'workspace-file/not-regular-file':
        case 'workspace-file/outside-workspace':
        case 'FS_NOT_REGULAR_FILE':
        case 'FS_PERMISSION_DENIED':
        case 'FS_SANDBOX_DENIED':
            return 403;
        case 'gateway/bad-request':
            return 400;
        case 'FS_ABORTED':
            return 499;
        default:
            return 500;
    }
}
/**
 * Enumerate one file's bytes into a response body, one window at a time.
 *
 * The reader is pulled rather than pushed: nothing is read until the consumer
 * asks for another chunk, which is what keeps a slow browser from making the
 * Host accumulate the file. The stream ends at the first short window, at the
 * size a stat reported, or at the first empty window for a backend that reports
 * no size. A failing read errors the stream, so a truncated download is a
 * failed one rather than a shorter file.
 * @param readWindow - reads the bytes at `[offset, offset + length)`, shorter only at the file's end.
 * @param size - the file's complete byte size when the backend reports it.
 * @param chunkBytes - the largest window one read asks for.
 * @returns the response body.
 */
export function byteStream(readWindow, size, chunkBytes) {
    let offset = 0;
    return new ReadableStream({
        async pull(controller) {
            const window = await readWindow(offset, chunkBytes);
            if (window.byteLength === 0) {
                controller.close();
                return;
            }
            offset += window.byteLength;
            controller.enqueue(window);
            const done = size === undefined ? window.byteLength < chunkBytes : offset >= size;
            if (done)
                controller.close();
        },
    });
}
//# sourceMappingURL=download.js.map