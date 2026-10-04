// @vitest-environment jsdom
/**
 * Handing files to the browser's download manager.
 *
 * What is asserted is the route and the order: each file gets one URL naming the
 * session and the path, a `HEAD` preflight runs before each save so a refusal is
 * a line rather than a saved error page, saves start one after the other in the
 * order the selection was made, and an aborted tab ends the gesture without
 * reporting anything. The two carriers are both here: the Host's streaming route,
 * and the `file://` shell's fallback that decodes what the Remote face read.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  downloadFiles, downloadUrlFor, httpDownloadsAvailable, saveBase64File, WORKSPACE_DOWNLOAD_PATH,
} from '../src/client/download.ts'
import type { DownloadCarrier } from '../src/client/download.ts'

const SESSION = 's-test' as SessionId

/** A carrier that answers every preflight with one status and records what it did. */
function carrier(status = 200): DownloadCarrier & { readonly heads: string[]; readonly saves: [string, string][] } {
  const heads: string[] = []
  const saves: [string, string][] = []
  return {
    heads,
    saves,
    head: (url) => {
      heads.push(url)
      return Promise.resolve({ ok: status < 400, status })
    },
    save: (url, name) => { saves.push([url, name]) },
  }
}

describe('downloadUrlFor', () => {
  it('names the route, the session, and the path', () => {
    const url = new URL(downloadUrlFor(SESSION, '/work/app/a b.txt'))
    expect(url.pathname).toBe(WORKSPACE_DOWNLOAD_PATH)
    expect(url.searchParams.get('sessionId')).toBe('s-test')
    expect(url.searchParams.get('path')).toBe('/work/app/a b.txt')
  })
})

describe('httpDownloadsAvailable', () => {
  it('is true for a page the Host served, and false for a shell with no route', () => {
    // The jsdom default is a page served over HTTP.
    expect(httpDownloadsAvailable()).toBe(true)
    vi.stubGlobal('location', { origin: 'null' })
    expect(httpDownloadsAvailable()).toBe(false)
    vi.stubGlobal('location', { origin: '' })
    expect(httpDownloadsAvailable()).toBe(false)
    vi.stubGlobal('location', {})
    expect(httpDownloadsAvailable()).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('saveBase64File', () => {
  it('decodes the payload and hands the browser a blob URL under the file name', () => {
    const clicked: HTMLAnchorElement[] = []
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revoked: string[] = []
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => { revoked.push(url) })

    saveBase64File('a.txt', 'aGk=')

    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('a.txt')
    expect(clicked[0]!.href).toBe('blob:fake')
    expect(create).toHaveBeenCalledTimes(1)
    expect(revoked).toEqual(['blob:fake'])
    // What is handed over is the decoded payload, not the base64 text.
    const blob = create.mock.calls[0]![0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    anchor.mockRestore()
    create.mockRestore()
    revoke.mockRestore()
  })
})

describe('downloadFiles', () => {
  const FILES = [
    { path: '/work/app/a.txt', name: 'a.txt' },
    { path: '/work/app/src/b.txt', name: 'b.txt' },
  ]

  it('preflights and saves every file in order', async () => {
    const api = carrier()
    const report = await downloadFiles(FILES, SESSION, new AbortController().signal, api)
    expect(report).toEqual({ started: 2, failures: [] })
    expect(api.heads.map(head => new URL(head).searchParams.get('path'))).toEqual(['/work/app/a.txt', '/work/app/src/b.txt'])
    expect(api.saves.map(([, name]) => name)).toEqual(['a.txt', 'b.txt'])
  })

  it('reports a refused file by name and status and keeps going', async () => {
    let calls = 0
    const api: DownloadCarrier = {
      head: () => {
        calls += 1
        return Promise.resolve(calls === 1 ? { ok: false, status: 404 } : { ok: true, status: 200 })
      },
      save: vi.fn<(url: string, name: string) => void>(),
    }
    const report = await downloadFiles(FILES, SESSION, new AbortController().signal, api)
    expect(report).toEqual({ started: 1, failures: ['a.txt: HTTP 404'] })
    expect(api.save).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('b.txt'), 'b.txt')
  })

  it('reports a preflight that could not be made at all', async () => {
    const api: DownloadCarrier = {
      head: () => Promise.reject(new Error('offline')),
      save: vi.fn<(url: string, name: string) => void>(),
    }
    const report = await downloadFiles([FILES[0]!], SESSION, new AbortController().signal, api)
    expect(report).toEqual({ started: 0, failures: ['a.txt: offline'] })
    expect(api.save).not.toHaveBeenCalled()
  })

  it('reports a rejection that is not an Error as itself', async () => {
    const api: DownloadCarrier = {
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- rejecting a non-Error is the case under test.
      head: () => Promise.reject('nope'),
      save: vi.fn<(url: string, name: string) => void>(),
    }
    expect(await downloadFiles([FILES[0]!], SESSION, new AbortController().signal, api))
      .toEqual({ started: 0, failures: ['a.txt: nope'] })
  })

  it('ends the gesture when the tab record is aborted', async () => {
    const controller = new AbortController()
    const heads: string[] = []
    const saves: [string, string][] = []
    const api: DownloadCarrier = {
      head: (url) => {
        heads.push(url)
        controller.abort()
        return Promise.resolve({ ok: true, status: 200 })
      },
      save: (url, name) => { saves.push([url, name]) },
    }
    // The abort lands while the first preflight is in flight: the save it was
    // waiting for is dropped, and the second file is never asked for.
    const report = await downloadFiles(FILES, SESSION, controller.signal, api)
    expect(report).toEqual({ started: 0, failures: [] })
    expect(heads).toHaveLength(1)
    expect(saves).toEqual([])
  })

  it('ends the gesture quietly when a preflight fails after the abort', async () => {
    const controller = new AbortController()
    const api: DownloadCarrier = {
      head: () => {
        controller.abort()
        return Promise.reject(new Error('aborted'))
      },
      save: vi.fn<(url: string, name: string) => void>(),
    }
    expect(await downloadFiles(FILES, SESSION, controller.signal, api)).toEqual({ started: 0, failures: [] })
  })

  it('downloads nothing when handed no files', async () => {
    const api = carrier()
    expect(await downloadFiles([], SESSION, new AbortController().signal, api)).toEqual({ started: 0, failures: [] })
    expect(api.heads).toEqual([])
  })
})
