/**
 * `sidebarDocumentPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a preview that cannot show a
 * page has to say which of several different things went wrong, and each one
 * suggests a different next step for the reader. The editor's lines say the
 * same about a refused save, whose likeliest cause is that the file moved on
 * underneath the reader.
 */
/** Simplified Chinese dictionary and key-set source of truth. */
export declare const zh: {
    loading: string;
    loadMore: string;
    changed: string;
    reloadNow: string;
    reload: string;
    'wrap.enable': string;
    'wrap.disable': string;
    'wrap.aria': string;
    openWith: string;
    'viewer.text': string;
    resourceUnavailable: string;
    rendererUnavailable: string;
    unsupportedFile: string;
    'error.notFound': string;
    'error.tooLarge': string;
    'error.notText': string;
    'error.notRegularFile': string;
    'error.unavailable': string;
    'error.writeTooLarge': string;
    'error.stale': string;
    'error.denied': string;
    edit: string;
    'edit.aria': string;
    'edit.save': string;
    'edit.saving': string;
    'edit.cancel': string;
    'edit.discard': string;
    'edit.confirmDiscard': string;
    'edit.recovered': string;
    'edit.compare': string;
    'edit.disk': string;
    'edit.resolved': string;
    retry: string;
};
/** Text-preview dictionary key union. */
export type SidebarDocumentPreviewKey = keyof typeof zh;
/** English dictionary, checked against the Chinese key set. */
export declare const en: {
    loading: string;
    loadMore: string;
    changed: string;
    reloadNow: string;
    reload: string;
    'wrap.enable': string;
    'wrap.disable': string;
    'wrap.aria': string;
    openWith: string;
    'viewer.text': string;
    resourceUnavailable: string;
    rendererUnavailable: string;
    unsupportedFile: string;
    'error.notFound': string;
    'error.tooLarge': string;
    'error.notText': string;
    'error.notRegularFile': string;
    'error.unavailable': string;
    'error.writeTooLarge': string;
    'error.stale': string;
    'error.denied': string;
    edit: string;
    'edit.aria': string;
    'edit.save': string;
    'edit.saving': string;
    'edit.cancel': string;
    'edit.discard': string;
    'edit.confirmDiscard': string;
    'edit.recovered': string;
    'edit.compare': string;
    'edit.disk': string;
    'edit.resolved': string;
    retry: string;
};
//# sourceMappingURL=locales.d.ts.map