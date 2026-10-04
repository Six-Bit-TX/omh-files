import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The delete dialog: one confirmation naming what goes, then the removal.
 *
 * Deletion is refused nowhere else: the reader confirmed it, and the Host is
 * the only party that knows whether the entry can go. A selection of several
 * entries is named by its count rather than by every basename. A failure the
 * Host reports stays in the dialog, which keeps its confirm button so the reader
 * can try again.
 */
import { useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './FilesBody.module.css';
/**
 * Render the delete confirmation.
 * @param props - see {@link DeleteDialogProps}.
 * @returns the dialog element.
 */
export function DeleteDialog({ names, t, onConfirm, onClose }) {
    const only = names.length === 1 ? names[0] : undefined;
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const confirm = () => {
        setBusy(true);
        setFailure(null);
        void onConfirm().then((line) => {
            setBusy(false);
            if (line === null)
                onClose();
            else
                setFailure(line);
        });
    };
    return (_jsx(Modal, { open: true, title: t('delete.title'), description: only === undefined
            ? t('delete.descriptionMany', { count: String(names.length) })
            : t('delete.description', { name: only }), closeLabel: t('dialog.close'), onClose: onClose, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: onClose, children: t('dialog.cancel') }), _jsx(Button, { variant: "outline", className: css.dangerButton, "data-delete-confirm": true, disabled: busy, onClick: confirm, children: t('delete.confirm') })] })), children: failure !== null && _jsx("p", { className: css.dialogError, role: "alert", "data-delete-failure": true, children: failure }) }));
}
//# sourceMappingURL=DeleteDialog.js.map