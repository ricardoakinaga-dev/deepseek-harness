---
description: "通过 present 声明交付可访问的文件；配置、Session 归属与源文件打开。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present

[English](README.md) | 中文

## 概述

使用 `present` 声明交付Session 文件系统可访问的最终文件，包括通过 shell 命令创建的文件。用户使用默认应用打开当前源文件。工具为配置字节上限内的每个文件保存不可变副本。源文件的编辑或删除不会改变 Session ZIP 导出中的已保存字节。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

共用的输出与文件链接指导由 [`dsh-deliverable-file-references`](../deliverable-file-references/README.zh.md) 提供，Web 与 SDK bundle 单独挂载该插件。

`present` 按 Session 的当前工作目录校验路径并记录绝对路径，因此后续目录切换不会让已交付文件指向其他位置。

`standard`、`ptc` 与 `cordis` Agent preset 挂载本插件。创建文件后，以 `files: [{ path, description? }]` 调用 `present`。文件必须是 Session 文件系统可访问的普通文件。相对路径按 Session 工作目录解析；绝对路径可以指向工作区外的文件，包括 `/tmp` 或 Downloads。文件缺失、为目录、最终路径为符号链接或提供方拒绝访问时，调用失败。Shell 沙箱私有 `/tmp` 中的文件需要先写入 Session 文件系统可访问的位置。

在 Agent 的 Cordis 组合中挂载，并提供 `tools`、`fs`、`attachments`、`workingDirectory` 和 `turnBoundary` Session 投影：

```yaml
- name: '@deepseek-ai/dsh-tool-present'
  config:
    maxFiles: 8
    maxFileBytes: 20971520
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxFiles` | `8` | 每次调用的最大文件数，为正整数 |
| `maxFileBytes` | `20971520`（20 MiB） | 单文件捕获上限，包含等于上限的情况；必须是小于 `Number.MAX_SAFE_INTEGER` 的正安全整数 |

挂载时校验两个上限。超过 `maxFileBytes` 的文件仍会声明，记录 `capture.status: too-large` 及实际采用的字节上限，结果提示模型保留原文件。恰好达到上限的文件和空文件都会保存。工具要求存在 Agent Session 和尚未结束的轮次。交付归调用方 Session 所有；父 Session 如需声明交付子 Agent 创建的文件，必须自行调用 `present`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

工具通过配置的文件系统提供方解析路径并读取有上限的原始字节，包括工作区外的文件。它通过 `attachments.saveFileStream` 依次保存文件，再返回内容寻址引用。每个已保存引用包含清理后的文件名、准确字节数和 SHA-256 标识。超大文件记录明确的未捕获结果；其他读取或存储失败会使调用失败，不发布交付事件。取消信号传递到读取和流式写入。失败、取消或被阻止的调用中已提交的对象可能按附件存储的保留策略成为未引用对象。成功的最终 `tools/result` 通知追加 `deliverables/presented`，嵌套调用也适用。外层程序随后失败不会撤销已完成的声明。被阻止的结果不发布声明。每个插件实例只记录其实际执行的调用；同名作用域工具不能通过其他实例发布交付。

纯 `./types` 入口声明 `PresentedFile` 与 Session 事件，不导入 Host 运行时代码。Web 消费方在展示或打开文件前校验持久声明。新声明保存绝对路径。历史相对路径声明继续以当前查看的 Session 原始工作区作为基准。

历史声明没有可选的 `capture` 字段；字段缺失不表示存在已保存副本。已保存引用独立于原始路径。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [文件系统子系统](../../../docs/subsystems/filesystem.zh.md)——提供方路径与错误。
- [Web 交付](../../client/ui-deliverables/README.zh.md)——源文件打开与卡片。
- [交付决策](../../../.agents/notes/implemented/feature/2026-09-08-present-workspace-source-files.zh.md)——Session 归属与读取端必须识别的事件。

<a id="model-experience"></a>
## 模型体验

### present

#### 模型看到的内容

[present schema](../../../docs/tool-catalog.zh.md#present)要求已有且可访问的文件：“Declare existing files as final deliverables for the user. Hosts may show presented files only after your turn ends, so call it once the files are final. If the user needs to review files earlier, such as before a tool call that waits for their answer, link them in your message instead. Use it when the user needs a separate file, especially Office documents, spreadsheets, and slide decks; prefer your final response when that suffices. A saved copy preserves the presented bytes within the configured file-size limit; larger files are declared without a saved copy. The original path remains available for opening the current file.” `files` 参数要求选择 1-2 个最重要的交付物，每次调用最多 4 个。已捕获文件的结果为 `Presented <path>`。超大文件的结果为 `Presented <path> (not saved: exceeds <maxBytes> bytes; keep the original file)`。程序结果和持久事件包含路径、可选说明和捕获结果。

#### Token 影响

每个挂载的 Agent 增加一个工具 schema，每个交付文件增加一行结果。文件字节不进入模型消息。

#### KV Cache 影响

工具 schema 在挂载期间保持静态。交付结果文本扩展对话，不重写提示词前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 元数据和 Host 路径检查无法原子性地阻止桌面应用打开文件前发生的路径替换。
- 原生打开和源文件预览使用当前原始路径。不得将已保存的附件对象作为可写文件传给编辑器。
- 历史声明和超大文件没有已保存字节。已捕获文件使用不会自动清理的附件存储；可编辑副本及其保留策略需要单独的所有者。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
