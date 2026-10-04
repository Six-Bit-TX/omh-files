import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './FilesBody.module.css';
/**
 * Render the move dialog.
 * @param props - see {@link MoveDialogProps}.
 * @returns the dialog element.
 */
export function MoveDialog({ names, destination, t, onConfirm, onClose }) {
    const [draft, setDraft] = useState(destination);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const inputRef = useRef(null);
    // Pre-filled and selected: typing replaces the directory, Enter accepts it.
    useLayoutEffect(() => { inputRef.current?.select(); }, []);
    const confirm = () => {
        setBusy(true);
        setFailure(null);
        void onConfirm(draft).then((line) => {
            setBusy(false);
            if (line === null)
                onClose();
            else
                setFailure(line);
        });
    };
    const invalid = draft.trim() === '';
    const only = names.length === 1 ? names[0] : undefined;
    return (_jsxs(Modal, { open: true, title: t('move.title'), description: only === undefined
            ? t('move.descriptionMany', { count: String(names.length) })
            : t('move.description', { name: only }), closeLabel: t('dialog.close'), onClose: onClose, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: onClose, children: t('dialog.cancel') }), _jsx(Button, { variant: "primary", "data-move-confirm": true, disabled: busy || invalid, onClick: confirm, children: t('move.confirm') })] })), children: [_jsx("input", { ref: inputRef, className: css.dialogInput, "data-move-input": true, "aria-label": t('move.input'), value: draft, onChange: (event) => { setDraft(event.target.value); } }), invalid && _jsx("p", { className: css.dialogError, role: "alert", "data-move-invalid": true, children: t('move.invalid') }), failure !== null && _jsx("p", { className: css.dialogError, role: "alert", "data-move-failure": true, children: failure })] }));
}
//# sourceMappingURL=MoveDialog.js.map