import { TYPERT } from '../dsh-api-workspace-files/lib/typert.host.js';

export const name = 'omh-files-rpc-schemas';
export const inject = ['typert'];

/** Generated descriptors require explicit registration for path-mounted replacement owners. */
export function apply(ctx) {
  ctx.effect(() => ctx.typert.register(TYPERT), 'omh-files: workspace-files RPC schemas');
}
