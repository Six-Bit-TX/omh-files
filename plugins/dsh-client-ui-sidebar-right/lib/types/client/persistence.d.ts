import type { SidebarRightSurfaceStore } from './service.ts';
import type { SurfaceState } from './stores.ts';
/**
 * Read one saved surface; unavailable storage and invalid records leave a fresh layout.
 * @param sessionId - owning Session.
 * @returns the validated layout with a new undo sequence, if available.
 */
export declare function readSidebarSurface(sessionId: string): SurfaceState | undefined;
/**
 * Save committed layout changes; disposal retains the last saved layout.
 * @param sessionId - owning Session.
 * @param store - adopted Session store.
 * @returns the persistence subscription disposer.
 */
export declare function persistSidebarSurface(sessionId: string, store: SidebarRightSurfaceStore): () => void;
//# sourceMappingURL=persistence.d.ts.map