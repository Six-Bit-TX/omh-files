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
export const zh = {
  loading: '正在读取…',
  loadMore: '加载更多',
  changed: '文件已更新，当前显示为旧内容',
  reloadNow: '重新载入',
  reload: '重新读取文件',
  'wrap.enable': '自动换行',
  'wrap.disable': '取消换行',
  'wrap.aria': '自动换行',
  openWith: '打开方式',
  'viewer.text': '纯文本',
  resourceUnavailable: '文件资源服务不可用',
  rendererUnavailable: '预览器 {name} 不可用',
  unsupportedFile: '该格式文件暂时无法预览',
  'error.notFound': '文件不存在，可能已被移动或删除',
  'error.tooLarge': '单页内容超过 {limit} 上限，无法读取',
  'error.notText': '该格式文件暂时无法预览',
  'error.notRegularFile': '该路径不是普通文件，没有可显示的内容',
  'error.unavailable': '读取失败：{message}',
  'error.writeTooLarge': '内容超过 {limit} 上限，无法保存',
  'error.stale': '文件已在磁盘上被修改，保存已取消',
  'error.denied': '当前权限不允许写入这个文件',
  edit: '编辑',
  'edit.aria': '文件内容',
  'edit.save': '保存',
  'edit.saving': '正在保存…',
  'edit.cancel': '取消',
  'edit.discard': '放弃修改并重新载入',
  'edit.confirmDiscard': '放弃未保存的修改？',
  'edit.recovered': '已恢复未保存的草稿。保存时仍会检查原文件版本。',
  'edit.compare': '查看磁盘上的当前内容（保留草稿）',
  'edit.disk': '磁盘上的当前内容',
  'edit.resolved': '已合并修改，使用当前文件版本保存',
  retry: '重试',
} satisfies Record<string, string>

/** Text-preview dictionary key union. */
export type SidebarDocumentPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  loading: 'Reading…',
  loadMore: 'Load more',
  changed: 'The file has changed, showing the previous content.',
  reloadNow: 'Reload',
  reload: 'Read the file again',
  'wrap.enable': 'Turn on line wrap',
  'wrap.disable': 'Turn off line wrap',
  'wrap.aria': 'Line wrap',
  openWith: 'Open with',
  'viewer.text': 'Plain text',
  resourceUnavailable: 'The file resource service is unavailable.',
  rendererUnavailable: 'The {name} preview is unavailable.',
  unsupportedFile: 'Preview is not available for this file type yet.',
  'error.notFound': 'File not found. It may have been moved or deleted.',
  'error.tooLarge': 'This page exceeds the {limit} limit and cannot be read.',
  'error.notText': 'Preview is not available for this file type yet.',
  'error.notRegularFile': 'Not a regular file, nothing to display.',
  'error.unavailable': 'Read failed: {message}',
  'error.writeTooLarge': 'The content exceeds the {limit} limit and cannot be saved.',
  'error.stale': 'The file changed on disk, so the save was refused.',
  'error.denied': 'Writing this file is not permitted here.',
  edit: 'Edit',
  'edit.aria': 'File content',
  'edit.save': 'Save',
  'edit.saving': 'Saving…',
  'edit.cancel': 'Cancel',
  'edit.discard': 'Discard changes and reload',
  'edit.confirmDiscard': 'Discard unsaved changes?',
  'edit.recovered': 'Your unsaved draft was restored. Saving still checks the original file version.',
  'edit.compare': 'Read current disk content and keep draft',
  'edit.disk': 'Current disk content',
  'edit.resolved': 'I have merged the changes; use this file version',
  retry: 'Retry',
} satisfies Record<SidebarDocumentPreviewKey, string>
