---
description: "dsh Web 客户端右侧 Sidebar 的文件树 tab 类型：通过网络逐层列出会话工作区根目录，右键可对多行选择进行下载、移动或删除，并按资源地址把文件打开到 Sidebar。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-files

[English](README.md) | 中文

## 概述

右侧 Sidebar 的导航器 tab 类型：把会话的工作区根目录画成一棵树，逐层经线上列出，并把文件打开到 Sidebar 里。它是从引导页进入的页类型，不认领任何地址；它按地址打开文件，交给 `dsh-resource://file` 的查看器认领：`ui-sidebar-right` 里没有任何东西认识本包。多行可以构成一个选择，右键即对该选择给出面向条目的操作：复制、下载、移动与删除。读者从自己机器上选择或拖入的文件，经 Host 的上传端点落进树中的某个目录。

## 目录

- [注册了什么](#what-it-registers)
- [树](#the-tree)
- [上传](#uploading)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册了什么

- **类型**：`ctx.sidebarRightTabs.register(...)`，kind 为 `files`，id 为 `@deepseek-ai/dsh-client-ui-sidebar-files`，档位 `builtin`，没有 patterns，另有一个打开该类型的引导页入口（order 10，标题与描述取自 `sidebarFiles` 命名空间，图标是共享的文件夹图标）。
- **正文**：以该 id 为键的 `sidebar.right.pane.tab` slot：strip 下的一行地址行，然后是树。地址行是文档预览（`ui-sidebar-documentpreview`）路径行加两个控件：路径本身就是地址，可就地编辑（点击换成以该 tab 的根为初值的文本框；Enter 列出所输入的地址，Escape 与失焦恢复显示），行首的文件夹按钮打开位置菜单，右端是重新读取。这一行是复制而非共享，因为插件 bundle 只经平台模块共享运行时代码；待 artifact 与各 slot 的形态定下来后，可以在 `ui-primitives` 放一份供每个 pane 标题行使用。
- **标签页标题**：以该 id 为键的 `sidebar.right.pane.tab.title` slot：类型标签前的一枚 16px 共享 `FileTypeIcon` 文件夹图标。树本身的行不画这枚图标。

`src/client/` 下十七个源文件：`definition.tsx`（类型是什么）、`store.ts`（它保存什么）、`face.ts`（它如何列目录与改动，含 Remote 绑定）、`FilesBody.tsx`（它画什么）、`PathHeader.tsx`（地址行与位置菜单）、`EntryMenu.tsx`（行菜单）、`RenameDialog.tsx`、`MoveDialog.tsx`、`DeleteDialog.tsx`、`CompareDialog.tsx`、`TimelineDialog.tsx`（五个对话框）、`selection.ts`（绘制顺序、选择手势，以及菜单作用于什么）、`drag.ts`（被拖动行携带的载荷）、`paths.ts` 与 `download.ts`（以 `/` 拼接的路径辅助函数与浏览器下载）、`upload.ts`（字节进、base64 出）、`failures.ts`（失败行）、`FilesTitle.tsx`（标签页标题）、`locales.ts`（它说什么）、`index.ts`（接线）。

<a id="the-row-menu"></a>
## 行菜单

右键会在指针处用共享的 `Menu` 原语打开菜单，作用于该 tab 的选择：被点击的那一行若不在任何选择中，就是它自己；若在选择中，就是整个选择。只为单个条目成立的几行——打开（仅文件）、选择以进行比较、与已选文件进行比较（仅当该 tab 已选中比较基准时）、打开时间线（仅文件）、重命名——只在恰好一个条目时出现；面向条目的几行——复制路径、复制相对路径（相对该 tab 的根）、下载（选择中至少有一个文件时）、移动与删除——会写明并计数菜单作用于什么。复制经平台剪贴板写入，每行一个路径；下载把 Host 自己的流式路由交给浏览器，每个选中文件一次请求；移动与删除打开对话框。

选择由文件管理器通行的手势构成：普通点击选中一行并仍然激活它（目录展开/收起，文件打开），Ctrl/Cmd 点击增删一行且不激活，Shift 点击按显示顺序取锚点——上一次手势触及的那一行——与被点击行之间的区间。在选区之外的行上右键，会先把选择移到该行。移动或删除会结束选择，重新指定 tab 的根也会。

重命名、移动与删除是本 tab 的 Host 改动，且都被限制在会话工作区根内：`workspaceFiles.rename`、`workspaceFiles.move` 与 `workspaceFiles.delete` 会拒绝目录越过该根的路径。重命名打开的对话框拒绝空白名、含 `/` 或 `\` 的名字以及未改动的名字；删除先打开一个确认框，点名该条目或计数整个选择；移动打开的对话框以该 tab 的根为初值、拒绝空白目标，同一个移动也会由拖拽触发——把一行拖到目录行上会带上整个选择。移动之后会重读所有发生变化的目录：条目离开的那些，以及它们落到的那个（其绝对路径只有 Host 知道）。

下载是唯一离开 Remote 面的手势。本 tab 把 `/api/workspace.download?sessionId=…&path=…` 交给浏览器，即 Host 上那条已认证的路由：它逐窗口读取文件并边读边发，因此超过 Remote 完整文件上限的文件也能像其他文件一样下载。每个文件先用 `HEAD` 预检，从而把拒绝——文件已不在、不是普通文件、Session 未知——变成一行提示，而不是浏览器保存下来的错误页；多选下载按选择顺序每个文件一次请求。比较各自读取一页（2000 行）并用共享的 `DiffBlock` 渲染，被上限截断的一侧会注明。时间线列出该文件的 `git log`——最多 50 个提交、最新的在前——git 报告没有历史时如实说明；该路径不再另行检查是否属于仓库，因此仓库之外的文件就是没有历史。

<a id="the-tree"></a>
## 树

根是会话的工作目录，读自 `useSessions().byId[sessionId].cwd`，地址行里的拆分由 `@deepseek-ai/dsh-util-workspace-path` 的 `pathPartsOf` 给出。地址可就地编辑，因此该 tab 可以根在 Host 能列出的任何目录上——包括会话工作区之外的目录——位置菜单则提供 Client 已知的每个 Workspace、会话工作目录、Host 账户的主目录，以及该 tab 访问过的目录（最新的在前，最多八个）。新打开的 tab 总是从会话工作目录开始。每一层以绝对路径为键；子路径是父路径以 `/` 拼上条目名。一层在首次展开时经 `@deepseek-ai/dsh-api-workspace-files` 命名空间的 `remote.workspaceFiles.list(sessionId, absolutePath)` 列出；适配器保留列表的条目与截断标志，丢弃其工作区相对路径。行序为目录优先，其后按自然序、不分大小写的名称排列；dotfiles 与其他条目一样显示。

| 条目类型 | 行 |
|---|---|
| `directory` | 切换展开与折叠；该层在首次打开时拉取，折叠期间保留。 |
| `file` | 经 `useTabInfo().tab.actions.openResource` 打开 `dsh-resource://file/session/<sessionId>/<encoded path relative to the root>`，地址由 `@deepseek-ai/dsh-util-workspace-path` 的 `fileAddressFor` 从条目的绝对路径与树的根生成，落在该 tab 自己的 pane 里。 |
| `other` | 灰显且不可点击，从而完整呈现目录内容。 |

被端点条目上限截断的层以一条标记收尾；空层如实说明；失败的层按错误码各显示一行（`workspace-file/not-found`、`outside-workspace`、`not-directory`），其他情况显示传输层自己的消息。重新读取丢弃所有已列出的层并只对展开中的层重新请求；折叠的层在下次打开时重新拉取。没有工作目录的会话只显示一行说明，而不是树。

状态保存在类型自己的存储里，按 tab id 分桶：`root`、`levels`（每个绝对路径的 loading / ready / failed）、`expanded`、`scrollTop`、`recent`（该 tab 访问过的目录）、`compareBase`（选中用于比较的条目）、`selected`（该 tab 的选择，按构建顺序）、`anchor`（Shift 点击延伸的起点行）与 `uploads`（正在进入的文件）。滚动期间偏移由正文自己记录，卸载时一次性写入。存储比 body 活得久，切到其他侧栏 tab 再切回来时树带着已加载的层重新挂载，滚动位置与已选比较基准也随之恢复。owner 的 `signal` 终结一个桶：中止时忘掉该 tab，其后才结算的列表与卸载时的偏移提交都什么也不写。

<a id="uploading"></a>
## 上传

文件有两条路从读者自己的机器进来：地址行末端的上传控件打开浏览器的文件选择器，以及把桌面文件拖到树上。两者都指向一个目录——选择器与拖到正文空白处指向 tab 的根，拖到目录行上则指向该目录（它的整棵子树都算作该目录）。若传输携带的是这棵树自己拖动的行，那是一次移动；传输载荷本身区分这两种情况。

每个文件都被整体读取、编码为 base64，并作为一次 `remote.workspaceFiles.upload(sessionId, path, data)` 调用发出，受 Host 的整文件上限约束——这正是上传成为下载镜像的原因。同一个 tab 的上传按请求顺序逐个进行：每个文件在途时都完整占一份内存，因此多选大文件是被“顺序发送”而不是“并发发送”所限定的。

每个文件从被选中那一刻起就在头部下方占一行，直到 Host 给出答复。落盘的文件让出该行，接收它的目录若原本折叠会被展开并重新列出，因此新文件不会藏在折叠的层里；被拒绝的那一行保留，带上原因和一个忽略控件。上传从不替换：名字已被占用会以 `workspace-file/exists` 返回，把新字节放到那里是另一个决定——先把旧条目改名或删除。

<a id="model-experience"></a>
## 模型体验

无，因为本包在浏览器里绘制工作区文件树，不注册任何面向模型的内容。

#### KV Cache 影响

无；目录列表经 Remote 传输，不会组装模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>
- **改动限制在工作区内。**重命名、移动与删除会拒绝目录越过会话工作区根的条目（移动还包括目标目录），尽管列目录与读取能到更远的地方；剪切/复制/粘贴、搜索、当前文件高亮与文件系统监听都没有——一层只会因重新读取、改动后对受影响层的重读，或导航手势而变化。
- **多选下载一次一个文件。**若浏览器把连续的程序化下载当作弹窗，会请读者放行一次；对整批选择打一个包属于延期工作，且 ZIP 应归 Host 路由所有。
- **选择不会随列表变化而清理。**某层重新列出后不再包含的路径仍然是选中状态，因此在这样的选择上打开菜单时，只会作用于仍能解析的那些行，否则退回菜单自己的那一行——绝不会对无法完整解析的选择动手。
- **`file://` 壳退回有上限的读取。**流式路由只在挂载了 connection 载体的 Web 运行时存在。没有该载体的壳（Electron 组合不提供 HTTP）改用 Remote 面下载：字节整体经线路到达，并受 Host `maxFileBytes` 限制——而这正是本功能为 Web GUI 解除的那个上限。因此这类壳上的下载保持此前行为，而不是直接失败。
- **移动对话框要手输路径。**目标按地址栏的词汇输入，而不是从选择器里点选：Client 自己没有目录选择器，拖拽手势则是同一个移动的指点设备入口。
- **上传是“整个文件在内存里”。**页面先把选中的文件整体读出并整体编码再发送，所以拦住它的是 Host 的 `maxFileBytes`，而不是某个流式边界；同样出于这个原因，多选是逐个发送的，而拒绝发生在读者的文件已经被读过之后。
- **上传从不替换。** 名字已被占用是拒绝（`workspace-file/exists`），而不是以覆盖的方式“解决”；想让新字节落在那里，读者要先改名或删除旧条目。既没有随上传新建目录，也没有上传时改名，也没有断点续传。
- **是列目录，不是文件管理器。**本包本身不需要 git，但时间线动词会如实报告文件所在目录的 `git log` 结果，因此仓库之外的文件——或 `PATH` 上没有 git 的主机——得到的是没有历史，而不是报错。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布 companion。树唯一的运行时状态是每 tab 一份的 Slot store，由持有它的正文写入、随 tab 的中止信号忘掉；没有第二个观测源可与之比对。
