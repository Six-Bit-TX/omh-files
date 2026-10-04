/**
 * The move dialog: one destination directory for the entries the reader
 * selected, validated before the Host is asked.
 *
 * The destination is typed in the same vocabulary as the address bar — absolute
 * anywhere the Host can reach, or relative to this session's workspace root —
 * so the dialog says nothing the tree does not already teach. A blank one is
 * refused here, because an empty path is a keystroke rather than a destination;
 * everything else is the Host's to answer, and its refusal stays in the dialog
 * with the typed destination still there to correct.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import css from './FilesBody.module.css'

/** Everything the move dialog draws and the move it performs. */
export interface MoveDialogProps {
  /** The names of the entries being moved, as the dialog describes them. */
  readonly names: readonly string[]
  /** The destination directory the field starts on. */
  readonly destination: string
  /** Namespace-bound translate. */
  readonly t: TranslateNS<'sidebarFiles'>
  /**
   * Move the entries into the typed directory.
   * @param destination - the destination the reader confirmed.
   * @returns a localized failure line, or null when the Host accepted it.
   */
  readonly onConfirm: (destination: string) => Promise<string | null>
  /** Dismiss the dialog. */
  readonly onClose: () => void
}

/**
 * Render the move dialog.
 * @param props - see {@link MoveDialogProps}.
 * @returns the dialog element.
 */
export function MoveDialog({ names, destination, t, onConfirm, onClose }: MoveDialogProps): ReactNode {
  const [draft, setDraft] = useState(destination)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Pre-filled and selected: typing replaces the directory, Enter accepts it.
  useLayoutEffect(() => { inputRef.current?.select() }, [])

  const confirm = (): void => {
    setBusy(true)
    setFailure(null)
    void onConfirm(draft).then((line) => {
      setBusy(false)
      if (line === null) onClose()
      else setFailure(line)
    })
  }
  const invalid = draft.trim() === ''
  const only = names.length === 1 ? names[0] : undefined
  return (
    <Modal
      open
      title={t('move.title')}
      description={only === undefined
        ? t('move.descriptionMany', { count: String(names.length) })
        : t('move.description', { name: only })}
      closeLabel={t('dialog.close')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button
            variant="primary"
            data-move-confirm
            disabled={busy || invalid}
            onClick={confirm}
          >
            {t('move.confirm')}
          </Button>
        </>
      )}
    >
      <input
        ref={inputRef}
        className={css.dialogInput}
        data-move-input
        aria-label={t('move.input')}
        value={draft}
        onChange={(event) => { setDraft(event.target.value) }}
      />
      {invalid && <p className={css.dialogError} role="alert" data-move-invalid>{t('move.invalid')}</p>}
      {failure !== null && <p className={css.dialogError} role="alert" data-move-failure>{failure}</p>}
    </Modal>
  )
}
