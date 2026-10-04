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
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'

/** What kind of entry a row menu was opened on. */
export type EntryKind = 'file' | 'directory'

/** The row menu's item ids, in the order the menu shows them. */
export type EntryMenuAction =
  | 'open'
  | 'compareSelect'
  | 'compareWith'
  | 'timeline'
  | 'copyPath'
  | 'copyRelativePath'
  | 'download'
  | 'move'
  | 'rename'
  | 'delete'

/** One entry a menu can act on. */
export interface EntrySelection {
  /** Absolute path of the entry. */
  readonly path: string
  /** The entry's basename. */
  readonly name: string
  /** Whether the entry is a file or a directory. */
  readonly kind: EntryKind
}

/** One entry a menu was opened on, and where the pointer was. */
export interface EntryTarget extends EntrySelection {
  /** Viewport x of the pointer that opened the menu. */
  readonly x: number
  /** Viewport y of the pointer that opened the menu. */
  readonly y: number
}

/** Everything the row menu draws and the gestures it reports. */
export interface EntryMenuProps {
  /** The entry the menu was opened on. */
  readonly target: EntryTarget
  /** The entries its rows act on, the target included. */
  readonly selection: readonly EntrySelection[]
  /** The file selected as this tab's compare base, or null. */
  readonly compareBase: string | null
  /** Namespace-bound translate. */
  readonly t: TranslateNS<'sidebarFiles'>
  /** Perform one row's action. */
  readonly onSelect: (action: EntryMenuAction) => void
  /** Dismiss the menu. */
  readonly onClose: () => void
}

/**
 * Render one entry's context menu, placed at the pointer that opened it.
 * @param props - see {@link EntryMenuProps}.
 * @returns the portaled menu list.
 */
export function EntryMenu({ target, selection, compareBase, t, onSelect, onClose }: EntryMenuProps): ReactNode {
  // A menu is one entry's exactly when the selection is one entry: every row
  // below either names that entry's own file or counts the selection.
  const single = selection.length === 1 ? selection[0] : undefined
  const files = selection.filter(entry => entry.kind === 'file')
  const items: MenuEntry[] = [{ id: 'open', label: t('menu.open'), disabled: single?.kind !== 'file' }]
  if (single?.kind === 'file') {
    items.push({ id: 'compareSelect', label: t('menu.compareSelect') })
    if (compareBase !== null && compareBase !== single.path) {
      items.push({ id: 'compareWith', label: t('menu.compareWith') })
    }
    items.push({ id: 'timeline', label: t('menu.timeline') })
  }
  // The entry-wide rows name what they will act on, so a selection of several
  // entries is never mistaken for one.
  const count = String(selection.length)
  const many = selection.length > 1
  items.push({ type: 'separator', id: 'separator-entries' })
  items.push({ id: 'copyPath', label: t('menu.copyPath') })
  items.push({ id: 'copyRelativePath', label: t('menu.copyRelativePath') })
  if (files.length > 0) {
    items.push({
      id: 'download',
      label: files.length === 1 ? t('menu.download') : t('menu.downloadMany', { count: String(files.length) }),
    })
  }
  items.push({ id: 'move', label: many ? t('menu.moveMany', { count }) : t('menu.move') })
  items.push({ type: 'separator', id: 'separator-destructive' })
  if (single !== undefined) items.push({ id: 'rename', label: t('menu.rename') })
  items.push({
    id: 'delete',
    label: many ? t('menu.deleteMany', { count }) : t('menu.delete'),
    danger: true,
  })
  // Placement reads the pointer, not an element; the rect is rebuilt only when
  // the pointer moves to another entry, so the menu settles on the first frame.
  const getAnchorRect = useCallback(() => new DOMRect(target.x, target.y, 0, 0), [target.x, target.y])
  return (
    <Menu
      open
      autoFocus
      anchor={null}
      items={items}
      onSelect={(id) => { onSelect(id as EntryMenuAction) }}
      onClose={onClose}
      portal
      getAnchorRect={getAnchorRect}
    />
  )
}
