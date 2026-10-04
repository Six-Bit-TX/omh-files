/**
 * The tree's failure lines, one per kind of gesture.
 *
 * A directory that could not be listed is named as a directory: gone, outside
 * the workspace, or not a directory at all each suggest a different next step.
 * A gesture on one entry reads its own line, where a size cap is worth naming
 * and every other code speaks for itself.
 */
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * Say why a directory could not be listed, in terms of the directory.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show under the directory.
 */
export declare function failureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string;
/**
 * Say why one upload was refused. A name already taken and a file over the cap
 * are the two the reader can act on — rename or delete first, or pick a smaller
 * file — and a policy refusal names the directory as the thing that refuses.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show on the upload's row.
 */
export declare function uploadFailureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string;
/**
 * Say why a gesture on one entry failed.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show beside the entry.
 */
export declare function actionFailureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string;
//# sourceMappingURL=failures.d.ts.map