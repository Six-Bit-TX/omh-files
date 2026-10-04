/**
 * The tree's failure lines, one per kind of gesture.
 *
 * A directory that could not be listed is named as a directory: gone, outside
 * the workspace, or not a directory at all each suggest a different next step.
 * A gesture on one entry reads its own line, where a size cap is worth naming
 * and every other code speaks for itself.
 */
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'

/**
 * Say why a directory could not be listed, in terms of the directory.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show under the directory.
 */
export function failureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'workspace-file/not-found': return t('error.notFound')
    case 'workspace-file/outside-workspace': return t('error.outsideWorkspace')
    case 'workspace-file/not-directory': return t('error.notDirectory')
    // Carrier and unclassified host failures reach the reader as themselves:
    // this tree knows nothing useful to add to a transport-level message.
    default: return t('error.unavailable', { message: failure.message })
  }
}

/**
 * Say why one upload was refused. A name already taken and a file over the cap
 * are the two the reader can act on — rename or delete first, or pick a smaller
 * file — and a policy refusal names the directory as the thing that refuses.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show on the upload's row.
 */
export function uploadFailureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'workspace-file/exists': return t('upload.exists')
    case 'workspace-file/too-large': return t('upload.tooLarge')
    case 'workspace-file/denied': return t('upload.denied')
    case 'workspace-file/not-regular-file': return t('upload.notFile')
    // Everything else — a vanished directory, a carrier failure — speaks for
    // itself, as it does for the other gestures on an entry.
    default: return t('error.actionFailed', { message: failure.message })
  }
}

/**
 * Say why a gesture on one entry failed.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show beside the entry.
 */
export function actionFailureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string {
  if (failure.code === 'workspace-file/too-large') return t('error.tooLarge')
  return t('error.actionFailed', { message: failure.message })
}
