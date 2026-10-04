import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The row menu: what can be done to the entries a right-click landed on, opened
 * where the pointer was.
 *
 * A context menu has no trigger of its own, so the list is placed from a
 * zero-size rect at the pointer instead of from an anchor element, and it
 * portals out of the tree so no scrolling ancestor can crop it.
 *
 * The menu acts on a selection, not always on one row: the row the pointer was
 * over is part of the tab's selection and the selection is bigger, so the whole
 * selection is what the entry-wide rows — copy, download, move, delete — name
 * and count. The rows that only make sense for one entry (open, compare,
 * timeline, rename) are offered for exactly one, and are absent rather than
 * disabled otherwise. A directory has nothing to open, compare, download, or
 * read a timeline of, so those rows are absent too — except `open`, which stays
 * visible and disabled so the menu's rows keep one order.
 */
import { useCallback } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Render one entry's context menu, placed at the pointer that opened it.
 * @param props - see {@link EntryMenuProps}.
 * @returns the portaled menu list.
 */
export function EntryMenu({ target, selection, compareBase, t, onSelect, onClose }) {
    // A menu is one entry's exactly when the selection is one entry: every row
    // below either names that entry's own file or counts the selection.
    const single = selection.length === 1 ? selection[0] : undefined;
    const files = selection.filter(entry => entry.kind === 'file');
    const items = [{ id: 'open', label: t('menu.open'), disabled: single?.kind !== 'file' }];
    if (single?.kind === 'file') {
        items.push({ id: 'compareSelect', label: t('menu.compareSelect') });
        if (compareBase !== null && compareBase !== single.path) {
            items.push({ id: 'compareWith', label: t('menu.compareWith') });
        }
        items.push({ id: 'timeline', label: t('menu.timeline') });
    }
    // The entry-wide rows name what they will act on, so a selection of several
    // entries is never mistaken for one.
    const count = String(selection.length);
    const many = selection.length > 1;
    items.push({ type: 'separator', id: 'separator-entries' });
    items.push({ id: 'copyPath', label: t('menu.copyPath') });
    items.push({ id: 'copyRelativePath', label: t('menu.copyRelativePath') });
    if (files.length > 0) {
        items.push({
            id: 'download',
            label: files.length === 1 ? t('menu.download') : t('menu.downloadMany', { count: String(files.length) }),
        });
    }
    items.push({ id: 'move', label: many ? t('menu.moveMany', { count }) : t('menu.move') });
    items.push({ type: 'separator', id: 'separator-destructive' });
    if (single !== undefined)
        items.push({ id: 'rename', label: t('menu.rename') });
    items.push({
        id: 'delete',
        label: many ? t('menu.deleteMany', { count }) : t('menu.delete'),
        danger: true,
    });
    // Placement reads the pointer, not an element; the rect is rebuilt only when
    // the pointer moves to another entry, so the menu settles on the first frame.
    const getAnchorRect = useCallback(() => new DOMRect(target.x, target.y, 0, 0), [target.x, target.y]);
    return (_jsx(Menu, { open: true, autoFocus: true, anchor: null, items: items, onSelect: (id) => { onSelect(id); }, onClose: onClose, portal: true, getAnchorRect: getAnchorRect }));
}
//# sourceMappingURL=EntryMenu.js.map