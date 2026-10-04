/**
 * The failure line one Remote code deserves.
 *
 * Kept apart from the component so the mapping is testable on its own. Codes
 * this reader does not name fall to the generic line carrying the carrier's
 * message. {@link saveFailureLine} adds the refusals only a write can meet.
 */
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client';
/**
 * Say what went wrong, in terms of the file rather than of the transport.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show in place of the file.
 */
export declare function failureLine(t: TranslateNS<'sidebarDocumentPreview'>, failure: RemoteFailure): string;
/**
 * Say why a save was refused. A save meets the read vocabulary — the file can
 * be gone or over a limit — plus two refusals only a write can produce, and its
 * size line names the write's cap rather than a page's.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show beside the editor.
 */
export declare function saveFailureLine(t: TranslateNS<'sidebarDocumentPreview'>, failure: RemoteFailure): string;
//# sourceMappingURL=failure-line.d.ts.map