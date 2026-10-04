import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The rename dialog: one entry's new name, validated before the Host is asked.
 *
 * The name is one path segment, so a blank name and one carrying a separator
 * are refused here — the Host would refuse them too, and telling the reader
 * before the round trip is the difference between a validation and an error.
 * Until the name differs from the current one, confirming would be a no-op, so
 * the confirm button stays disabled. A failure the Host does report stays in
 * the dialog, with the name the reader typed still there to correct.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './FilesBody.module.css';
/** Whether one typed name is a usable single path segment. */
export function validEntryName(name) {
    return name.trim() !== '' && !/[/\\]/.test(name);
}
/**
 * Render the rename dialog.
 * @param props - see {@link RenameDialogProps}.
 * @returns the dialog element.
 */
export function RenameDialog({ name, t, onConfirm, onClose }) {
    const [draft, setDraft] = useState(name);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const inputRef = useRef(null);
    // Pre-filled and selected: typing replaces the old name, Enter accepts it.
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
    const invalid = !validEntryName(draft);
    return (_jsxs(Modal, { open: true, title: t('rename.title'), closeLabel: t('dialog.close'), onClose: onClose, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: onClose, children: t('dialog.cancel') }), _jsx(Button, { variant: "primary", "data-rename-confirm": true, disabled: busy || invalid || draft === name, onClick: confirm, children: t('rename.confirm') })] })), children: [_jsx("input", { ref: inputRef, className: css.dialogInput, "data-rename-input": true, "aria-label": t('rename.input'), value: draft, onChange: (event) => { setDraft(event.target.value); } }), invalid && _jsx("p", { className: css.dialogError, role: "alert", "data-rename-invalid": true, children: t('rename.invalid') }), failure !== null && _jsx("p", { className: css.dialogError, role: "alert", "data-rename-failure": true, children: failure })] }));
}
//# sourceMappingURL=RenameDialog.js.map