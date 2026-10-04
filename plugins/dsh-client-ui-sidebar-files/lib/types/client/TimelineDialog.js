import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The timeline dialog: one file's commits, newest first.
 *
 * A file outside a repository, one never committed, or a Host without git all
 * answer with no commits, and that is what the empty line says. A date is drawn
 * through the dictionary's own template rather than `toLocaleString`: the
 * browser's language is not the app's, and a switch would otherwise leave the
 * two mixed in one row.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { actionFailureLine } from "./failures.js";
import css from './FilesBody.module.css';
/** One commit's author date, through the dictionary's date template. */
function dateLabel(date, t) {
    const at = new Date(Date.parse(date));
    const pad = (value) => String(value).padStart(2, '0');
    return t('timeline.date', {
        y: at.getFullYear(),
        m: pad(at.getMonth() + 1),
        d: pad(at.getDate()),
        h: pad(at.getHours()),
        mi: pad(at.getMinutes()),
    });
}
/**
 * Render one file's commit history.
 * @param props - see {@link TimelineDialogProps}.
 * @returns the dialog element.
 */
export function TimelineDialog({ path, t, loadHistory, onClose }) {
    const [history, setHistory] = useState(null);
    const [failure, setFailure] = useState(null);
    useEffect(() => {
        setHistory(null);
        setFailure(null);
        void loadHistory(path).then((result) => {
            if (result.ok)
                setHistory(result.value);
            else
                setFailure(result.error);
        });
    }, [path, loadHistory]);
    return (_jsxs(Modal, { open: true, title: t('timeline.title'), closeLabel: t('dialog.close'), onClose: onClose, className: css.timelineDialog ?? '', children: [_jsx("div", { className: css.timelinePath, "data-timeline-path": true, children: path }), failure !== null && (_jsx("p", { className: css.dialogError, role: "alert", "data-timeline-failure": true, children: actionFailureLine(t, failure) })), failure === null && history === null && (_jsx("p", { className: css.dialogNote, "data-timeline-loading": true, children: t('loading') })), history !== null && history.entries.length === 0 && (_jsx("p", { className: css.dialogNote, "data-timeline-empty": true, children: t('timeline.empty') })), history !== null && history.entries.length > 0 && (_jsx("ul", { className: css.timelineList, children: history.entries.map(entry => (_jsxs("li", { className: css.timelineRow, "data-timeline-entry": entry.shortHash, children: [_jsx("span", { className: css.timelineHash, children: entry.shortHash }), _jsx("span", { className: css.timelineSubject, children: entry.subject }), _jsx("span", { className: css.timelineMeta, children: t('timeline.meta', { author: entry.author, date: dateLabel(entry.date, t) }) }), entry.additions + entry.deletions > 0 && (_jsx("span", { className: css.timelineCounts, "data-timeline-counts": true, children: t('timeline.counts', { additions: entry.additions, deletions: entry.deletions }) }))] }, entry.hash))) }))] }));
}
//# sourceMappingURL=TimelineDialog.js.map