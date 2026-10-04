/**
 * What the tree has selected, and which gesture changed it.
 *
 * Selection is this tab's list of absolute paths, in the order they were added,
 * plus the entry a range measures from. Three gestures produce it: a plain click
 * selects exactly the row it landed on, a Ctrl/Cmd click adds or removes that
 * row, and a Shift click takes everything between the anchor and the row clicked
 * — in the tree's own display order, which is the order {@link visiblePaths}
 * walks. A plain click still opens or toggles its row; the two modified gestures
 * only select.
 *
 * Nothing here writes: the store owns the list, and this module is what the body
 * reads it with.
 */
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import { childPath } from './face.ts'
import { entryName, parentPath } from './paths.ts'
import type { FilesTabState } from './store.ts'
import type { EntrySelection, EntryTarget } from './EntryMenu.tsx'

/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Which of the three selection gestures one click carries. */
export type SelectionGesture = 'plain' | 'toggle' | 'range'

/**
 * Order one level's entries for display: directories first, then everything
 * else, each group by name. The endpoint's order is a listing fact; this is the
 * reader's.
 * @param entries - the listing as the endpoint returned it.
 * @returns a new array, directories first, then by name within each group.
 */
export function orderEntries(entries: readonly WorkspaceDirectoryEntry[]): WorkspaceDirectoryEntry[] {
  return [...entries].sort((left, right) => {
    const group = Number(right.type === 'directory') - Number(left.type === 'directory')
    return group !== 0 ? group : byName.compare(left.name, right.name)
  })
}

/**
 * Every selectable row the tree is showing right now, in display order: each
 * loaded level's entries, depth-first through the directories that are open.
 * An entry the endpoint calls neither a file nor a directory is not one of them,
 * because it cannot be opened, moved, or downloaded either.
 * @param state - this tab's tree.
 * @returns the absolute paths of the visible rows, in the order they are drawn.
 */
export function visiblePaths(state: FilesTabState): string[] {
  const paths: string[] = []
  const walk = (directory: string): void => {
    const level = state.levels[directory]
    if (level === undefined || level.kind !== 'ready') return
    for (const entry of orderEntries(level.level.entries)) {
      if (entry.type === 'other') continue
      const path = childPath(directory, entry.name)
      paths.push(path)
      if (entry.type === 'directory' && state.expanded.includes(path)) walk(path)
    }
  }
  walk(state.root)
  return paths
}

/**
 * The rows a Shift click selects: everything between the anchor and the clicked
 * row inclusive, in display order either way round. Without an anchor, or with
 * one that is no longer on screen, the click selects its own row alone.
 * @param order - the visible paths, in display order.
 * @param anchor - the path the range measures from, or null.
 * @param path - the row that was clicked.
 * @returns the paths to select, in display order.
 */
export function rangeBetween(order: readonly string[], anchor: string | null, path: string): string[] {
  const to = order.indexOf(path)
  const from = anchor === null ? -1 : order.indexOf(anchor)
  if (from < 0 || to < 0) return [path]
  return order.slice(Math.min(from, to), Math.max(from, to) + 1)
}

/**
 * Which selection gesture one click carries: a Ctrl/Cmd click toggles, a Shift
 * click extends, and anything else selects just the row it landed on. Ctrl/Cmd
 * wins when both are held, which is what every file manager does with them.
 * @param event - the click, read for its modifier keys.
 * @returns the gesture to apply.
 */
export function selectionGesture(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>): SelectionGesture {
  if (event.metaKey || event.ctrlKey) return 'toggle'
  if (event.shiftKey) return 'range'
  return 'plain'
}

/**
 * One entry as the listing that showed it reported it.
 *
 * The selection holds paths, so this is how a path becomes a name and a kind
 * again: the parent level is the only thing that knows them. A path no loaded
 * level holds — its directory was reloaded, or the entry is gone — resolves to
 * undefined, and a caller acting on a selection treats that as a reason not to.
 * @param state - this tab's tree.
 * @param path - absolute path of the entry.
 * @returns the entry, or undefined when no loaded level holds it.
 */
export function entryAt(state: FilesTabState, path: string): EntrySelection | undefined {
  const level = state.levels[parentPath(path)]
  if (level === undefined || level.kind !== 'ready') return undefined
  const name = entryName(path)
  const entry = level.level.entries.find(candidate => candidate.name === name)
  if (entry === undefined || entry.type === 'other') return undefined
  return { path, name, kind: entry.type === 'directory' ? 'directory' : 'file' }
}

/**
 * The entries one row menu acts on: the tab's whole selection while the row the
 * menu opened on is part of it, and that row alone otherwise.
 *
 * A selection this tree can no longer resolve in full is never acted on in part:
 * the menu falls back to its own row rather than moving, deleting, or
 * downloading fewer entries than it names.
 * @param state - this tab's tree.
 * @param target - the row the menu was opened on.
 * @returns the entries the menu's rows apply to, never empty.
 */
export function menuTargets(state: FilesTabState, target: EntryTarget): EntrySelection[] {
  if (state.selected.length > 1 && state.selected.includes(target.path)) {
    const entries = state.selected.map(path => entryAt(state, path))
    if (entries.every((entry): entry is EntrySelection => entry !== undefined)) return entries
  }
  return [{ path: target.path, name: target.name, kind: target.kind }]
}
