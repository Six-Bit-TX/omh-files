/**
 * Handing a workspace file to the browser's download manager.
 *
 * The bytes do not travel through the Remote face: `readAll` holds one base64
 * window inside a single JSON-RPC answer, which is why the Host refuses a file
 * above its complete-file cap. A download instead navigates the browser at the
 * Host's own `/api/workspace.download` route, which streams the file straight
 * to disk, so any file the reader can read is a file they can download.
 *
 * A selection downloads one file per request, in order, each after a `HEAD`
 * preflight: the preflight is what turns a refusal — gone, not a regular file,
 * a session the Host does not know — into a line the reader sees, instead of a
 * browser save of an error page. The browser's own multiple-download permission
 * is the price of that, and it is asked once.
 *
 * A `file://` shell has no route to reach: it decodes what the Remote face read
 * instead, which is the capped path this module carried before the route.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** The Host route one browser download reads. */
export declare const WORKSPACE_DOWNLOAD_PATH = "/api/workspace.download";
/** One file a download gesture was asked for. */
export interface DownloadFile {
    /** Absolute path of the file. */
    readonly path: string;
    /** The basename the browser offers to save it as. */
    readonly name: string;
}
/** What one download gesture did: how many files it started, and why the rest did not. */
export interface DownloadReport {
    /** Files the browser was handed a save for. */
    readonly started: number;
    /** One line per file that could not start, in the order they were asked for. */
    readonly failures: readonly string[];
}
/** The two browser operations a download performs, so a test can drive it without a browser. */
export interface DownloadCarrier {
    /** Preflight one URL; a transport failure rejects. */
    readonly head: (url: string, signal: AbortSignal) => Promise<{
        ok: boolean;
        status: number;
    }>;
    /** Hand one URL and name to the browser's download manager. */
    readonly save: (url: string, name: string) => void;
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
export declare function httpDownloadsAvailable(): boolean;
/**
 * The absolute download URL of one workspace file.
 * @param sessionId - the session whose workspace root a relative path resolves against.
 * @param path - absolute path, or a path relative to that workspace root.
 * @returns the URL to hand the browser.
 */
export declare function downloadUrlFor(sessionId: SessionId, path: string): string;
/**
 * Save one base64 payload the Remote face read as a download named `name`.
 *
 * This is the `file://` shell's path: the bytes arrived whole on the wire, so
 * they are decoded here and handed to the browser as one Blob URL.
 * @param name - the file name the browser offers.
 * @param base64 - the file's complete content, base64-encoded.
 */
export declare function saveBase64File(name: string, base64: string): void;
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
export declare function downloadFiles(files: readonly DownloadFile[], sessionId: SessionId, signal: AbortSignal, carrier?: DownloadCarrier): Promise<DownloadReport>;
//# sourceMappingURL=download.d.ts.map