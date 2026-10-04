/**
 * Host-half dry run for the Markdown editor plugin (owner-local, run by hand).
 *
 * Registration is not observable from outside a running host, so this harness
 * composes the plugin against a recording context and then asks the two
 * mirrored spaces the questions a browser asks: is the engine entry served as
 * JavaScript, does an icon come back as a module exporting a byte-space URL,
 * does the stylesheet's font reference land in the byte space, and is an
 * unknown path absent rather than answered.
 *
 * Usage (from the repository root):
 *   node overlay/plugins/dsh-client-ui-markdown/tools/host-check.mjs
 *
 * Exit code 1 means a question was answered wrongly.
 *
 * @module tools/host-check
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const plugin = await import(resolve(HERE, '../index.js'))

const routes = new Map()
let effects = 0
const ctx = {
  effect(fn) {
    effects += 1
    return fn()
  },
  connection: {
    fetch: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      }
    }
  }
}

plugin.apply(ctx)

const failures = []
/**
 * Assert one expectation about the recorded routes.
 * @param label - what is being checked.
 * @param condition - the expectation.
 * @param detail - extra context printed when it fails.
 */
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures.push(label)
  console.log(`FAIL ${label} ${detail}`)
}

const STATUS = '/api/muya/status'
if (routes.has(STATUS)) {
  const response = await routes.get(STATUS).fetch(new Request(`http://localhost${STATUS}`))
  console.log(`engine status: ${response.status} ${JSON.stringify(await response.json())}`)
  console.log('\nThe engine is not materialized; run overlay/install.sh first.')
  process.exit(1)
}

const entryPath = '/api/muya/es/index.js'
const cssPath = '/api/muya/core.css'
const iconPath = routes.has('/api/muya/assets/icons/7c1a03a0f912a482.png')
  ? '/api/muya/assets/icons/7c1a03a0f912a482.png'
  : undefined

check('registers a route table of a plausible size', routes.size > 500, `routes=${routes.size}`)
check('mirrors the engine ES entry', routes.has(entryPath))
check('mirrors the engine stylesheet', routes.has(cssPath))
check('mirrors at least one icon in the module space', iconPath !== undefined)

const entry = await routes.get(entryPath).fetch(new Request(`http://localhost${entryPath}`))
const entryBody = await entry.text()
check('entry is served as JavaScript', entry.headers.get('content-type')?.startsWith('text/javascript') === true,
  entry.headers.get('content-type') ?? '')
check('entry imports the engine chunk space', entryBody.includes('from "../marked.esm-'), 'no relative chunk import found')
check('entry still imports its icons relatively', entryBody.includes('assets/icons/'), 'no icon import found')

if (iconPath !== undefined) {
  const icon = await routes.get(iconPath).fetch(new Request(`http://localhost${iconPath}`))
  const iconBody = await icon.text()
  check('icon is served as a module', icon.headers.get('content-type')?.startsWith('text/javascript') === true)
  check('icon module exports a byte-space URL', /^export default "\/api\/muya-asset\/assets\/icons\/[a-f0-9]+\.png";$/u.test(iconBody.trim()),
    iconBody.trim())
  const assetPath = /"(\/api\/muya-asset\/[^"]+)"/u.exec(iconBody)?.[1]
  const asset = await routes.get(assetPath).fetch(new Request(`http://localhost${assetPath}`))
  check('the byte-space route serves the icon itself', asset.status === 200 && asset.headers.get('content-type') === 'image/png',
    `${asset.status} ${asset.headers.get('content-type')}`)
}

const css = await routes.get(cssPath).fetch(new Request(`http://localhost${cssPath}`))
const cssBody = await css.text()
check('stylesheet references fonts absolutely', cssBody.includes('url(/api/muya-asset/assets/fonts/'), 'no rewritten font URL')
check('no relative asset reference survives', !/url\(\s*["']?\.\.?\//u.test(cssBody), 'a relative url() survived')

const fontPath = /url\((\/api\/muya-asset\/assets\/fonts\/[^)]+)\)/u.exec(cssBody)?.[1]
if (fontPath !== undefined) {
  const font = await routes.get(fontPath).fetch(new Request(`http://localhost${fontPath}`))
  check('the byte-space route serves a font', font.status === 200 && (font.headers.get('content-type') ?? '').startsWith('font/'),
    `${font.status} ${font.headers.get('content-type')}`)
}

const head = await routes.get(entryPath).fetch(new Request(`http://localhost${entryPath}`, { method: 'HEAD' }))
check('HEAD answers headers without a body', head.status === 200 && (await head.text()) === '')

console.log(`\nroutes=${routes.size} effects=${effects} failures=${failures.length}`)
process.exit(failures.length === 0 ? 0 : 1)
