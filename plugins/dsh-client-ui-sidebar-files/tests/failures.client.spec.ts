/**
 * One sentence per endpoint code, for the two gestures that can be refused: a
 * listing under a directory, and an upload that never became an entry.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { actionFailureLine, failureLine, uploadFailureLine } from '../src/client/failures.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

describe('failureLine', () => {
  it('names each code a directory listing can report', () => {
    expect(failureLine(t, new RemoteError('workspace-file/not-found', 'gone', { path: '/w' }))).toBe(zh['error.notFound'])
    expect(failureLine(t, new RemoteError('workspace-file/outside-workspace', 'out', { path: '/w' }))).toBe(zh['error.outsideWorkspace'])
    expect(failureLine(t, new RemoteError('workspace-file/not-directory', 'file', { path: '/w', kind: 'file' }))).toBe(zh['error.notDirectory'])
    expect(failureLine(t, new RemoteError('gateway/internal', 'socket closed', {}))).toBe('读取失败：socket closed')
  })
})

describe('actionFailureLine', () => {
  it('names the size cap and passes everything else through in the carrier’s words', () => {
    expect(actionFailureLine(t, new RemoteError('workspace-file/too-large', 'big', { path: '/w', limit: 4 }))).toBe(zh['error.tooLarge'])
    expect(actionFailureLine(t, new RemoteError('gateway/internal', 'socket closed', {}))).toBe('操作失败：socket closed')
  })
})

describe('uploadFailureLine', () => {
  it('names what the reader can act on', () => {
    expect(uploadFailureLine(t, new RemoteError('workspace-file/exists', 'taken', { path: '/w/a.bin' }))).toBe(zh['upload.exists'])
    expect(uploadFailureLine(t, new RemoteError('workspace-file/too-large', 'big', { path: '/w/a.bin', limit: 4 }))).toBe(zh['upload.tooLarge'])
    expect(uploadFailureLine(t, new RemoteError('workspace-file/denied', 'no', { path: '/w/a.bin' }))).toBe(zh['upload.denied'])
    expect(uploadFailureLine(t, new RemoteError('workspace-file/not-regular-file', 'dir', { path: '/w/a.bin', kind: 'directory' }))).toBe(zh['upload.notFile'])
  })

  it('passes anything else through in the carrier’s words', () => {
    expect(uploadFailureLine(t, new RemoteError('workspace-file/not-found', 'gone', { path: '/w/a.bin' }))).toBe('操作失败：gone')
  })
})
