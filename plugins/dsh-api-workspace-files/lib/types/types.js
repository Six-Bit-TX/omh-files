/**
 * Wire types of the `workspaceFiles` Remote namespace. Types only: generated
 * Remote clients consume this module without Host runtime code.
 *
 * Paths arrive in the two vocabularies every method's `path` argument accepts:
 * an absolute path in the filesystem's execution world, or a path relative to
 * the Session's workspace root. Results answer in one of two:
 *
 * - `read`, `readBytes`, `readAll`, `readRelated`, `stat`, and `history` report the
 *   file's absolute path, because their consumer is the Client resource system,
 *   whose `dsh-resource://file/session/<id>/<path>` address carries that same
 *   path.
 * - `list` reports the listed directory as a workspace path when the root
 *   contains it, and as its absolute path otherwise.
 *
 * @module @deepseek-ai/dsh-api-workspace-files/types
 */
export {};
//# sourceMappingURL=types.js.map