# @local/dsh-client-ui-markdown

[English](README.md) | 中文

在 dsh Web GUI 的右侧栏标签页内直接编辑 Markdown：会话里的 `.md` 和 `.markdown` 文件在渲染编辑器（MarkText 使用的 Muya 内核）中打开，同时提供源码模式、带版本校验的保存，以及逐文件的序列化往返检查，避免编辑器重新格式化无法逐字节还原的文件。

配套文档：[`../../docs/dsh-markdown-editor.md`](../../docs/dsh-markdown-editor.md) 介绍设计、引擎调研和实际限制。

## 文件布局

| 路径 | 职责 |
|---|---|
| `index.js` | 宿主部分：通过两个经过身份验证的 `/api` 路径空间提供引擎包（见下文），除此之外不含业务逻辑。 |
| `client.js` | 浏览器部分：`markdown` 标签页类型、面板、往返检查和受保护的保存。手写的 `window.__ModuleLoader__.load` 包；仅将 `react` 和 `ui-primitives` 作为外部依赖。 |
| `vendor/muya-core/` | 固定版本的引擎（`@muyajs/core@0.2.0`），由 `install.sh` 下载到本地。此处不纳入版本控制；13 MB 的发布产物保存在配置档案中。 |
| `tools/host-check.mjs` | 宿主部分的试运行：将其与记录操作的上下文组合，并向资源路径空间发出浏览器会发出的请求。 |
| `tools/roundtrip.mjs` | 对语料而非单个文件执行往返检查，为面板行为提供依据。 |

## 为什么有两个 `/api` 路径空间，以及为什么需要宿主部分

`@muyajs/core` 提供浏览器 ES 模块图。入口通过相对路径导入同级分片，将 47 个 PNG 图标**作为模块**导入（浏览器无法执行），样式表还引用同目录下的 81 个字体和图标。Connection 的共享通道只处理精确路由，不支持通配符，因此宿主部分遍历一次包内的 `lib/`，为每个文件注册一条精确路由：

- `/api/muya/…`——**模块空间**：JavaScript 和 CSS 保持原样，图标则转换成一行 ES 模块，导出用于获取其内容的 URL。
- `/api/muya-asset/…`——**字节空间**：供样式表的 `url(…)` 或 `<img>` 获取资源。引擎样式表在返回前被重写，使相对引用指向此处。

共 935 条路由，全部通过 cookie 验证身份，无法访问包内 `lib/` 之外的内容；引擎缺失时，由 `/api/muya/status` 返回原因说明。

## 往返检查（此处“安全”的含义）

引擎的序列化器会规范化某些结构，因此面板在打开文件时对其进行序列化，并与磁盘上的字节比较：

| 结果 | 行为 |
|---|---|
| 字节完全相同 | 以渲染模式打开。 |
| 存在差异 | 以**源码模式**打开并说明原因，同时提供仍以渲染模式打开的按钮；从渲染模式保存时，会报告将改动的行数。 |
| 引擎不可用 | 仍可通过源码模式编辑和保存，并说明引擎错误。 |

在本仓库上的测量结果（3,451 个 `.md` 文件，使用 `tools/roundtrip.mjs`）：

```
2099  identical                (61%)
 758  content-changed          (mostly nested-list indentation: 4 spaces -> 2)
 275  table-padding            (cells padded to column width)
 132  paragraph-reflow
 102  table-padding + fence info string truncated (```ts ignore-check -> ```ts)
  72  lines-added
  12  unclassified-large
   1  trailing-newline
```

因此，大多数实际文件默认使用渲染模式，而会被改写的文件会明确提示，不会悄悄发生变化。所有模式还采用两项保护：未记录编辑时，保存不会写入任何内容；每次保存都携带读取文件时的版本，因此如果 agent（智能体）在此期间改写了文件，保存会被拒绝（`workspace-file/stale`），而不会覆盖该文件。

保存只确认该请求提交的草稿。写入尚未完成时发生的编辑会保留在编辑器中，并继续标记为未保存；下一次保存使用返回的文件版本。切换文件或重新加载会使尚未完成的请求回调失效，因此先前文件的保存结果无法替换当前草稿或其版本。

未保存的 Markdown 草稿按 Session 和文件存入浏览器存储，保留原始文本与文件版本。刷新或重新挂载 tab 时会在源码模式恢复，即使暂时无法读取文件也保留草稿。如果磁盘版本已变化，面板显示当前文本，直到用户合并修改并明确接受该版本后才允许保存。关闭有修改的 tab 或放弃草稿需要确认；浏览器跳转会提示已加载的未保存草稿。浏览器存储受当前源和配额限制，不是跨设备备份。

## 安装与验证

```sh
cd overlay
./install.sh          # materializes the engine (once) and installs the rows
# then, because a new Loader row is composed only at host boot:
#   1. restart `dsh web`
#   2. refresh the page
```

```sh
# host half, without touching a running server
node overlay/plugins/dsh-client-ui-markdown/tools/host-check.mjs

# the gate over a corpus (argument-less walks the repository)
node overlay/plugins/dsh-client-ui-markdown/tools/roundtrip.mjs
node overlay/plugins/dsh-client-ui-markdown/tools/roundtrip.mjs README.md docs/architecture.md
```

离线保存回归测试使用检出目录已安装的 Web 依赖和 Playwright Chromium：`node overlay/plugins/dsh-client-ui-markdown/tests/save.browser.mjs`。测试覆盖保存尚未完成时继续编辑、写入完成前切换文件，以及浏览器刷新后恢复草稿并处理磁盘修改冲突。

`roundtrip.mjs` 驱动序列化器，而不挂载编辑器：`Muya.init()` 需要真实浏览器（在 jsdom 中会报 `focus is not defined`），而决定文件字节的是 `getMarkdown()`，因此测试程序测量的是与保存相关的部分。其 `MUYA_INIT=1` 开关会尝试挂载路径，并报告 jsdom 的失败，而不隐藏它。

## 许可证

引擎代码采用 MIT 许可证（随仓库内副本附带 `vendor/muya-core/LICENSE`）。字体则不是：KaTeX 字体采用 SIL OFL 1.1，`@marktext/file-icons` 携带 FontAwesome（同样采用 OFL 1.1），DejaVu Sans Mono 采用 Bitstream Vera 许可证，而 npm 压缩包本身**不附带** OFL 声明。本仓库不重新分发该引擎副本，但进一步分发这些字体的构建必须携带相应声明。面板自身的样式使用产品的 `--dsw-*` token，不采用引擎的 33 种编辑器主题（其中一些以商业产品命名）。

## 本包尚未提供的功能（P1+）

格式工具栏和斜杠菜单（`Muya.use(InlineFormatToolbar)` 等，引擎附带 17 个插件）、向工作区粘贴图片（`imageAction`/`imagePathPicker` 钩子加宿主上传路由）、目录（`getTOC()`）、文档内搜索与替换（引擎方法）、用 CodeMirror 替代 textarea 的源码模式，以及模型侧的 `markdown_read`/`markdown_edit` 工具。
