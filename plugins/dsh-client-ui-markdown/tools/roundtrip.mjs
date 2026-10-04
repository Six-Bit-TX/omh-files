/**
 * P0 round-trip harness (owner-local, run by hand).
 *
 * The editor only earns its place if loading a file and serializing it back
 * leaves the bytes alone. This harness drives the same engine the pane loads —
 * `@muyajs/core`'s ES entry — under jsdom, over a corpus of real repository
 * Markdown, and reports every file whose serialization differs.
 *
 * Usage (from the repository root):
 *   node overlay/plugins/dsh-client-ui-markdown/tools/roundtrip.mjs [paths...]
 *
 * With no arguments it walks the repository for `*.md`, skipping `node_modules`
 * and `.git`. Exit code 1 means at least one file was rewritten.
 *
 * @module tools/roundtrip
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const HERE = dirname(fileURLToPath(import.meta.url))
/** The vendored engine, or the installed package when the vendor copy is absent. */
const ENGINE_ENTRY = [
  resolve(HERE, '../vendor/muya-core/lib/es/index.js'),
  resolve(HERE, '../node_modules/@muyajs/core/lib/es/index.js'),
].find((candidate) => existsSync(candidate))
const ROOT = resolve(HERE, '../../../../')
const SKIP = new Set(['node_modules', '.git', 'lib', 'dist', '.dsh-build', 'coverage'])

/**
 * Collect Markdown files under one path.
 * @param target - file or directory to collect from.
 * @returns absolute file paths.
 */
function collect(target) {
  const absolute = resolve(target)
  if (statSync(absolute).isFile()) return extname(absolute) === '.md' ? [absolute] : []
  const found = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const child = join(absolute, entry.name)
    if (entry.isDirectory()) found.push(...collect(child))
    else if (entry.isFile() && extname(entry.name) === '.md') found.push(child)
  }
  return found
}

/** Install the browser globals the engine reaches for while parsing. */
function installDom() {  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/'
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  // Node 22 exposes `navigator` as a getter-only global, so it is redefined rather than assigned.
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.HTMLElement = window.HTMLElement
  globalThis.Node = window.Node
  globalThis.Element = window.Element
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  globalThis.MutationObserver = window.MutationObserver
  globalThis.DOMParser = window.DOMParser
  // The engine reads `process.env.NODE_ENV`; Node already has a `process`, so
  // only the variable is ensured rather than the global being replaced.
  if (globalThis.process === undefined) globalThis.process = { env: { NODE_ENV: 'production' } }
  else process.env.NODE_ENV ??= 'production'
  return window
}

/** Minimal position-by-position preview of the first difference. */
function firstDifference(before, after) {
  const left = before.split('\n')
  const right = after.split('\n')
  const limit = Math.max(left.length, right.length)
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      return { line: index + 1, before: left[index], after: right[index] }
    }
  }
  return undefined
}

/**
 * Longest-common-subsequence line diff, guarded for size.
 *
 * A positional comparison reports a single inserted line as "everything after
 * this point changed", which is exactly the wrong impression for a Markdown
 * editor; this returns the removed and added lines themselves.
 * @param before - lines on disk.
 * @param after - lines the engine serialized.
 * @returns removed and added lines, or undefined when the pair is too large.
 */
function diffLines(before, after) {
  if (before.length * after.length > 4_000_000) return undefined
  const lengths = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1))
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = before[i] === after[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const removed = []
  const added = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i += 1
      j += 1
      continue
    }
    if (lengths[i + 1][j] >= lengths[i][j + 1]) removed.push(before[i++])
    else added.push(after[j++])
  }
  while (i < before.length) removed.push(before[i++])
  while (j < after.length) added.push(after[j++])
  return { removed, added }
}

/**
 * Classify one file's drift.
 *
 * Categories are ordered from least to most surprising, because the useful
 * question is what a user would lose by editing in the rendered mode.
 * @param original - the file as published.
 * @param serialized - the engine's serialization.
 * @returns a category name.
 */
function classify(original, serialized) {
  if (original === serialized) return 'identical'
  if (serialized === `${original}\n` || serialized === original.replace(/\r\n/gu, '\n')) return 'trailing-newline'
  const before = original.split('\n')
  const after = serialized.split('\n')
  const diff = diffLines(before, after)
  if (diff === undefined) return 'unclassified-large'
  const { removed, added } = diff
  if (removed.length === 0 && added.length === 0) return 'identical'
  const tableRow = (line) => line.trimStart().startsWith('|')
  // A fence's info string loses everything after the language: ```ts ignore-check → ```ts.
  const fenceTruncated = (line, pair) => {
    const match = /^(\s*)(`{3,}|~{3,})(\S+)(\s+.*)$/u.exec(line)
    return match !== null && pair === `${match[1]}${match[2]}${match[3]}`
  }
  const paired = removed.length === added.length
    ? removed.map((line, index) => [line, added[index]])
    : undefined
  const everyPair = (test) => paired !== undefined && paired.every(([line, pair]) => test(line, pair))
  if (everyPair((line) => line.trim() === '')) return 'blank-lines'
  if (paired !== undefined && everyPair((line, pair) => line.trimEnd() === line && line.trimEnd() === pair)) return 'trailing-whitespace'
  if (everyPair((line) => tableRow(line))) return 'table-padding'
  if (everyPair((line, pair) => tableRow(line) || fenceTruncated(line, pair))) {
    return paired.some(([line]) => fenceTruncated(line, '')) || paired.some(([line, pair]) => fenceTruncated(line, pair))
      ? 'table-padding+fence-info'
      : 'table-padding'
  }
  if (everyPair(fenceTruncated)) return 'fence-info'
  // A reflowed paragraph: the same words, wrapped differently.
  const reflow = (lines) => lines.join(' ').replace(/\s+/gu, ' ').trim()
  if (removed.length > 0 && reflow(removed) === reflow(added)) return 'paragraph-reflow'
  if (removed.length === 0) return 'lines-added'
  if (added.length === 0) return 'lines-removed'
  return 'content-changed'
}

const targets = process.argv.slice(2)
const files = (targets.length === 0 ? collect(ROOT) : targets.flatMap((target) => collect(target)))
  .sort()

// The engine imports its icons as modules, which a browser cannot execute
// either; the plugin's host half answers those requests with a one-line module
// exporting the icon URL. These hooks stand in for that route in Node.
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.png') || url.endsWith('.woff') || url.endsWith('.woff2') || url.endsWith('.ttf')) {
      return { format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true }
    }
    return next(url, context)
  },
})

installDom()
const engine = await import(ENGINE_ENTRY)
const { Muya } = engine
const container = document.getElementById('editor')

const counts = new Map()
const examples = []
for (const file of files) {
  const original = readFileSync(file, 'utf8')
  try {
    const editor = new Muya(container, { markdown: original })
    // `MUYA_INIT=1` drives the mounted editor instead of the bare serializer, to
    // show whether a real edit session drifts further than construction does.
    if (process.env.MUYA_INIT === '1') editor.init()
    const serialized = editor.getMarkdown()
    if (typeof editor.destroy === 'function') {
      try {
        editor.destroy()
      } catch {
        // A destroy before init touches no listeners; the round-trip is what is under test.
      }
    }
    const category = classify(original, serialized)
    counts.set(category, (counts.get(category) ?? 0) + 1)
    if (category === 'identical') continue
    if (examples.length < 400) examples.push({ file, category, original, serialized })
  } catch (error) {
    counts.set('failed', (counts.get('failed') ?? 0) + 1)
    console.log(`x ${relative(ROOT, file)}: ${error && error.message ? error.message : error}`)
  }
}

const interesting = examples.filter((entry) => entry.category !== 'table-padding' && entry.category !== 'trailing-newline')
for (const entry of interesting.slice(0, 12)) {
  const diff = diffLines(entry.original.split('\n'), entry.serialized.split('\n'))
  console.log(`! ${entry.category}  ${relative(ROOT, entry.file)}`)
  if (diff !== undefined) {
    for (const line of diff.removed.slice(0, 2)) console.log(`    - ${JSON.stringify(line)}`)
    for (const line of diff.added.slice(0, 2)) console.log(`    + ${JSON.stringify(line)}`)
  }
}

console.log('')
for (const [category, count] of [...counts].sort((left, right) => right[1] - left[1])) {
  console.log(`${String(count).padStart(5)}  ${category}`)
}
const drift = [...counts].filter(([category]) => category !== 'identical' && category !== 'failed')
  .reduce((total, [, count]) => total + count, 0)
console.log(`\nfiles=${files.length} identical=${counts.get('identical') ?? 0} drift=${drift} failed=${counts.get('failed') ?? 0}`)
process.exit((counts.get('failed') ?? 0) === 0 ? 0 : 1)
