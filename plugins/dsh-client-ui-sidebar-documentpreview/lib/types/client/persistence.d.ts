import { type TextState, type TextStore } from './store.ts';
/**
 * Restore only validated viewing fields and unsaved text with its original write guard.
 * @param sessionId - Session owning the tabs.
 * @returns initial state with no cached pages or pending operations.
 */
export declare function readTextState(sessionId: string): TextState;
/**
 * Save drafts and view state synchronously after each edit, without persisting file caches.
 * Removed dirty buckets remain recoverable during plugin disposal; explicit discard clears them first.
 * @param sessionId - Session owning the store.
 * @param instance - live tab store.
 * @returns subscription disposer.
 */
export declare function persistTextState(sessionId: string, instance: ReturnType<TextStore['create']>): () => void;
/**
 * Whether a store owns unsaved text, including tabs whose bodies are not mounted.
 * @param state - current document store.
 * @returns whether navigating away needs unsaved-change protection.
 */
export declare function hasDirtyDrafts(state: TextState): boolean;
//# sourceMappingURL=persistence.d.ts.map