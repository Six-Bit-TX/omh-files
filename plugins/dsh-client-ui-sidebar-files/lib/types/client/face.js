import { entryName } from "./paths.js";
import { base64Of } from "./upload.js";
/** How many lines of each file a comparison reads; the rest is reported as cut. */
export const COMPARE_PAGE_LINES = 2000;
/**
 * Bind the tree's Remote calls to one Client Remote face, keeping only what the
 * tree and its dialogs use: an entry never reaches a tree or a dialog, a page
 * drops the stat it travels with, and a move keeps the destination and the
 * entries it produced.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the Remote calls the tree's face performs.
 */
export function createFilesRemote(remote) {
    const files = remote.workspaceFiles;
    return {
        list: async (sessionId, path, signal) => {
            const result = await files.list(sessionId, path, signal);
            if (!result.ok)
                return result;
            return { ok: true, value: { entries: result.value.entries, truncated: result.value.truncated } };
        },
        readPage: async (sessionId, path, signal) => {
            const result = await files.read(sessionId, path, { limit: COMPARE_PAGE_LINES }, signal);
            if (!result.ok)
                return result;
            return { ok: true, value: { text: result.value.text, eof: result.value.eof } };
        },
        download: async (sessionId, path, signal) => {
            const result = await files.readAll(sessionId, path, signal);
            if (!result.ok)
                return result;
            return { ok: true, value: { name: entryName(path), base64: result.value.data } };
        },
        rename: async (sessionId, path, newName, signal) => {
            const result = await files.rename(sessionId, path, newName, signal);
            if (!result.ok)
                return result;
            return { ok: true, value: { absolutePath: result.value.absolutePath } };
        },
        remove: async (sessionId, path, signal) => {
            const result = await files.delete(sessionId, path, signal);
            if (!result.ok)
                return result;
            return { ok: true, value: { absolutePath: result.value.absolutePath } };
        },
        move: (sessionId, paths, destination, signal) => files.move(sessionId, paths, destination, signal),
        upload: async (sessionId, path, base64, signal) => {
            const result = await files.upload(sessionId, path, base64, signal);
            if (!result.ok)
                return result;
            return { ok: true, value: { absolutePath: result.value.absolutePath } };
        },
        history: (sessionId, path, signal) => files.history(sessionId, path, signal),
    };
}
/**
 * The absolute path of one child entry.
 *
 * Joined with `/` whatever the parent's separators: the Host resolves mixed
 * separators, and the tree only needs a stable key.
 * @param parent - absolute path of the listed directory.
 * @param name - the entry's basename.
 * @returns the child's absolute path.
 */
export function childPath(parent, name) {
    return `${parent.replace(/[/\\]+$/, '')}/${name}`;
}
/**
 * Bind the tree's face to one Remote face and one home resolver.
 * @param ops - the Remote calls, already adapted to what the tree stores.
 * @param home - reads the Host account's home directory; undefined until it is known.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function filesFace(ops, home) {
    return (sessionId, actions) => {
        /** Per tab, per absolute path: the listing generation a settlement must match; the latest request wins. */
        const generations = new Map();
        /** Per tab: the tail of that tab's upload queue, so one file is read at a time. */
        const uploads = new Map();
        const nextGeneration = (tabId, path) => {
            const byPath = generations.get(tabId) ?? new Map();
            generations.set(tabId, byPath);
            const generation = (byPath.get(path) ?? 0) + 1;
            byPath.set(path, generation);
            return generation;
        };
        const load = (tabId, path, signal) => {
            if (signal.aborted)
                return;
            const generation = nextGeneration(tabId, path);
            actions.loading(tabId, path);
            void ops.list(sessionId, path, signal).then((result) => {
                // A newer listing of this level was asked for since, or the record is
                // gone and its bookkeeping with it: nothing left for this one to write.
                if (generations.get(tabId)?.get(path) !== generation)
                    return;
                if (result.ok)
                    actions.loaded(tabId, path, result.value);
                else
                    actions.failed(tabId, path, result.error);
            });
        };
        return {
            start(tabId, root, signal) {
                actions.start(tabId, root);
                signal.addEventListener('abort', () => {
                    generations.delete(tabId);
                    uploads.delete(tabId);
                    actions.forget(tabId);
                }, { once: true });
                load(tabId, root, signal);
            },
            navigate(tabId, root, signal) {
                // A record that already ended has no bucket to write: its owner's
                // abort forgot the tab, and a navigation is not a reason to mint one.
                if (signal.aborted)
                    return;
                actions.navigate(tabId, root);
                load(tabId, root, signal);
            },
            load,
            toggle(tabId, path, loaded, signal) {
                actions.toggled(tabId, path);
                if (!loaded)
                    load(tabId, path, signal);
            },
            upload(tabId, dir, file, signal) {
                const path = childPath(dir, file.name);
                const queued = (uploads.get(tabId) ?? Promise.resolve()).then(async () => {
                    // A record that ended while this file waited its turn has nothing left
                    // to report to, so it is never read at all.
                    if (signal.aborted)
                        return undefined;
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    const result = await ops.upload(sessionId, path, base64Of(bytes), signal);
                    // A record that ended while the file was in flight settles into
                    // nothing for the same reason.
                    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the record can abort while the upload is awaited.
                    return signal.aborted ? undefined : result;
                });
                // The queue keeps its place whether the file landed or was refused.
                uploads.set(tabId, queued.catch(() => undefined));
                return queued;
            },
            rename: (path, newName, signal) => ops.rename(sessionId, path, newName, signal),
            remove: (path, signal) => ops.remove(sessionId, path, signal),
            move: (paths, destination, signal) => ops.move(sessionId, paths, destination, signal),
            download: (path, signal) => ops.download(sessionId, path, signal),
            readPage: (path, signal) => ops.readPage(sessionId, path, signal),
            history: (path, signal) => ops.history(sessionId, path, signal),
            homePath: home,
        };
    };
}
//# sourceMappingURL=face.js.map