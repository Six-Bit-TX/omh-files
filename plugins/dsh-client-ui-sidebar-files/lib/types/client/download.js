/** The Host route one browser download reads. */
export const WORKSPACE_DOWNLOAD_PATH = '/api/workspace.download';
/** The browser's origin, with the null-origin fallback the Host's own client uses. */
function hostBase() {
    const origin = globalThis.location?.origin;
    return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal';
}
/**
 * Whether this page can reach the Host's HTTP download route.
 *
 * A page served by the Host has an origin and reaches `/api` like any other
 * request. A `file://` shell (the Electron composition) has the null origin and
 * no HTTP server at all, so its downloads read the file through the Remote face
 * instead — capped, but working, which is what that shell had before the route.
 * @returns true when the route is reachable from this page.
 */
export function httpDownloadsAvailable() {
    const origin = globalThis.location?.origin;
    return origin !== undefined && origin !== 'null' && origin !== '';
}
/**
 * The absolute download URL of one workspace file.
 * @param sessionId - the session whose workspace root a relative path resolves against.
 * @param path - absolute path, or a path relative to that workspace root.
 * @returns the URL to hand the browser.
 */
export function downloadUrlFor(sessionId, path) {
    const url = new URL(WORKSPACE_DOWNLOAD_PATH, hostBase());
    url.searchParams.set('sessionId', String(sessionId));
    url.searchParams.set('path', path);
    return url.toString();
}
/**
 * Save one base64 payload the Remote face read as a download named `name`.
 *
 * This is the `file://` shell's path: the bytes arrived whole on the wire, so
 * they are decoded here and handed to the browser as one Blob URL.
 * @param name - the file name the browser offers.
 * @param base64 - the file's complete content, base64-encoded.
 */
export function saveBase64File(name, base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes]));
    saveWithAnchor(url, name);
    URL.revokeObjectURL(url);
}
/**
 * One file's `HEAD` preflight against the download route.
 * @param url - the download URL.
 * @param signal - the tab record's lifetime.
 * @returns the settled response's status, without a body.
 */
async function headOf(url, signal) {
    const response = await fetch(url, { method: 'HEAD', signal });
    return { ok: response.ok, status: response.status };
}
/**
 * Start one save with a synthetic anchor, which is how a browser is told to keep
 * a same-origin response instead of navigating to it.
 * @param url - the download URL.
 * @param name - the name the browser offers.
 */
function saveWithAnchor(url, name) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
}
/**
 * Download one file per request, in order, reporting the ones that could not
 * start. The gesture is sequential rather than concurrent: each save is a
 * browser navigation, and starting them together is what makes a browser
 * suppress the whole set.
 * @param files - the files the gesture selected, in the order to download them.
 * @param sessionId - the session whose workspace root a relative path resolves against.
 * @param signal - the tab record's lifetime; an abort ends the gesture silently.
 * @param carrier - the browser's two operations; the defaults use `fetch` and an anchor.
 * @returns how many saves started, and one line per file that did not.
 */
export async function downloadFiles(files, sessionId, signal, carrier = { head: headOf, save: saveWithAnchor }) {
    const failures = [];
    let started = 0;
    for (const file of files) {
        if (signal.aborted)
            break;
        const url = downloadUrlFor(sessionId, file.path);
        let status;
        try {
            const head = await carrier.head(url, signal);
            // The record ended while the preflight was in flight: the browser is not
            // handed a save for a tab that is gone.
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- the record can abort while the preflight is awaited.
            if (signal.aborted)
                break;
            if (head.ok) {
                carrier.save(url, file.name);
                started += 1;
                continue;
            }
            status = head.status;
        }
        catch (error) {
            // The gesture is over and its tree is gone: nothing left to report to.
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- the record can abort while the preflight is awaited.
            if (signal.aborted)
                break;
            failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        failures.push(`${file.name}: HTTP ${status}`);
    }
    return { started, failures };
}
//# sourceMappingURL=download.js.map