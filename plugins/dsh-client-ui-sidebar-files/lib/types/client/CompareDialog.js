import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The compare dialog: two files side by side, rendered as the change between
 * them, and the two paths the comparison is between.
 *
 * Each side is read as one bounded page; a side the Host cut leaves the reader
 * with a note rather than a silently partial answer. The diff itself is the
 * shared `DiffBlock`, so a comparison here reads exactly like every other
 * change surface.
 */
import { useEffect, useState } from 'react';
import { DiffBlock, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { actionFailureLine } from "./failures.js";
import css from './FilesBody.module.css';
/**
 * Render the comparison.
 * @param props - see {@link CompareDialogProps}.
 * @returns the dialog element.
 */
export function CompareDialog({ base, target, t, readPage, onClose }) {
    const [pages, setPages] = useState(null);
    const [failure, setFailure] = useState(null);
    // Both sides are read once when the dialog opens (or the pair changes): a
    // side that settles first waits for the other before anything is drawn.
    useEffect(() => {
        let basePage;
        let targetPage;
        const settle = () => {
            if (basePage !== undefined && targetPage !== undefined)
                setPages({ base: basePage, target: targetPage });
        };
        setPages(null);
        setFailure(null);
        void readPage(base).then((result) => {
            if (!result.ok) {
                setFailure(result.error);
                return;
            }
            basePage = result.value;
            settle();
        });
        void readPage(target).then((result) => {
            if (!result.ok) {
                setFailure(result.error);
                return;
            }
            targetPage = result.value;
            settle();
        });
    }, [base, target, readPage]);
    const labels = {
        copy: t('diff.copy'),
        copied: t('diff.copied'),
        collapse: t('diff.collapse'),
        expand: hidden => t('diff.expand', { hidden }),
        collapseAria: t('diff.collapseAria'),
        expandAria: hidden => t('diff.expandAria', { hidden }),
        files: count => t('diff.files', { count }),
    };
    return (_jsxs(Modal, { open: true, title: t('compare.title'), closeLabel: t('dialog.close'), onClose: onClose, className: css.compareDialog ?? '', children: [_jsx("div", { className: css.comparePaths, "data-compare-paths": true, children: t('compare.paths', { base, target }) }), failure !== null && (_jsx("p", { className: css.dialogError, role: "alert", "data-compare-failure": true, children: actionFailureLine(t, failure) })), failure === null && pages === null && (_jsx("p", { className: css.dialogNote, "data-compare-loading": true, children: t('loading') })), pages !== null && (_jsxs(_Fragment, { children: [(!pages.base.eof || !pages.target.eof) && (_jsx("p", { className: css.dialogNote, "data-compare-truncated": true, children: t('compare.truncated') })), _jsx(DiffBlock, { diffs: [{ path: target, oldText: pages.base.text, newText: pages.target.text }], labels: labels })] }))] }));
}
//# sourceMappingURL=CompareDialog.js.map