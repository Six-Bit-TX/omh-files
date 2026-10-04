---
description: "通过本机 ONLYOFFICE 服务在 Omchor 文件面板中编辑本地 DOCX、XLSX 和 PPTX 文件，并在保存时检查文件是否被其他写入方修改。"
kind: "package-reference"
---

# @local/dsh-client-ui-office

[English](README.md) | 中文

## 概述

在 Omchor 内打开并编辑本地 Word 文档、Excel 工作簿和 PowerPoint 演示文稿。编辑器使用本机 ONLYOFFICE Docs Community 容器，文档字节始终留在本机。保存会写回工作区文件；检测到外部修改时，保存操作拒绝覆盖。运行需要 Docker。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

从 Omchor 文件面板打开 `.docx`、`.xlsx` 或 `.pptx` 文件，编辑后选择面板顶部的**保存到本地**，等待**已保存到本地文件**再离开。编辑器完成待发送编辑内容的传输后，按钮才可用。存在待保存的更改时，浏览器离开页面前会显示警告。

### 安装

使用本机 Linux Docker 引擎，然后从仓库检出目录运行以下安装命令：

```sh
cd overlay/plugins/dsh-client-ui-office
node setup.mjs
node install.mjs
```

安装后重启 Omchor Web 配置并刷新页面。`setup.mjs` 使用按摘要固定的 ONLYOFFICE Docs Community 9.4.0.1 镜像，在 `127.0.0.1:3085` 启动 `omchor-office` 容器。它会复用使用相同镜像的现有容器，并拒绝替换使用不同镜像的同名容器。`install.mjs` 将插件安装到本地 Web 配置中。

安装程序将私有配置写入 `$DSH_HOME/office/config.json`；未设置 `DSH_HOME` 时则写入 `~/.dsh/office/config.json`，权限为 `0600`。请妥善保管生成的密钥。编辑器要求容器保持运行；容器停止后，可运行 `node setup.mjs` 重新启动。

Cordis 插件接受 `configPath`，用于选择其他私有配置文件。部署设置保存在该文件中：

| 字段 | 安装时的值 | 含义 |
|---|---|---|
| `editorOrigin` | `http://127.0.0.1:3085` | 本机编辑器 HTTP 源。 |
| `bridgeHost` | Docker 网桥网关 | 私有监听器地址。 |
| `secret` | 自动生成 | 共享 JWT 签名密钥。 |
| `maxFileBytes` | `67108864` | 源文档或保存文档的最大字节数。 |
| `maxSessions` | `32` | 活动编辑会话数量上限。 |

### 保存行为

编辑器自身的保存操作也可以写入文件并更新上次本地保存时间，但不会清除 Omchor 的待保存警告。**保存到本地**确认本次请求对应的编辑内容；之后产生的新编辑仍标记为待保存。最后一个编辑器标签页关闭后，也可触发延迟保存。

每次编辑会话中，首次实际改变文件的保存会将原始字节保留为同目录下的隐藏备份。保存通过 `ctx.fs` 原子写入二进制内容前，会比较当前文件摘要和文件系统版本；工作区权限和沙箱限制仍然生效。检测到外部修改时，保存操作会拒绝写入，不覆盖其他写入方的内容。保存失败时请保持编辑器打开，解决报告的问题后再重试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件将受支持的文件打开为 Office 标签页，并选择编辑器的 `theme-white` 主题。经过身份验证的同源 `/office` 请求将编辑器资源和连接代理到本机容器。Docker 网桥网关上的私有监听器使用分配的端口处理源文件下载和保存回调，并通过签名 JWT 授权这些请求。

编辑器发送完待发送的编辑内容后，**保存到本地**向 `/api/office.save` 提交 `{id, revision}`。宿主通过强制保存命令的 `userdata` 携带唯一的修订随机标识，签名回调会返回该标识。文件提交后，`/api/office.status` 通过 `savedRevision` 返回该标识。只有修订标识匹配且客户端编辑序号未变化时，才清除待保存状态并确认当前草稿。编辑器自身的保存和最终关闭回调仍会持久化字节，但仅凭它们的时间戳无法确认其中包含哪些客户端编辑。

插件省略 `./invariant`：其路由和编辑器标签页不提供需要通过运行时断言核对相互关系的独立服务观测。[决策记录](../../../.agents/notes/implemented/feature/2026-09-22-local-office-editor.zh.md)说明引擎选择和验证要求。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [ONLYOFFICE Docker 安装](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx)：本地服务部署。
- [ONLYOFFICE 保存协议](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/saving-file/)：强制保存和最终关闭行为。
- [Office 调研方案](../../docs/dsh-office-documents.md)：更广泛的备选方案与未支持的格式。

-----

<a id="model-experience"></a>
## 模型体验

本插件不增加模型工具、提示词或模型可见的会话事件。编辑由用户在文件面板中完成。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

本地编辑器存在以下限制：

- 仅支持 `.docx`、`.xlsx` 和 `.pptx`，不会静默转换旧版 `.doc`、`.xls` 和 `.ppt` 文件。
- 编辑要求使用可写的本地工作区，以及路径中不含符号链接的普通文件。工作区以外的文件会被拒绝。
- 复杂 OOXML 功能、字体和版式可能与 Microsoft Office 存在差异。保存不保证逐字节完整保留每一种功能。
- 标签页注册表无法阻止关闭。关闭编辑器标签页依赖延迟的最终保存回调；需要确认保存结果时，请选择**保存到本地**并等待**已保存到本地文件**。
- Docker 网桥集成面向本机 Linux 宿主；远程 Docker 引擎或 Docker Desktop 需要不同的网络配置。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
