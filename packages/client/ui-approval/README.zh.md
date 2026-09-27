---
description: "通过作用域交互路径响应 Host 权限请求的浏览器批准界面。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval

[English](README.md) | 中文

## 概述

当 Host 审批请求必须暂停 Conversation composer 等待用户决定时，挂载本浏览器插件。它把作用域化的 `approval/request` waterfall 投影到 Session UI，提供仅本次允许或拒绝，并将结果返回给等待中的 Host 操作。可选的 Session 作用域 detail Slot 可以呈现关联的 Tool 调用。持久权限策略仍由 Host 侧审批包拥有。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将 `@deepseek-ai/dsh-client-ui-approval` 挂载到已经提供 `ui-session`、`ui-conversation`、Client Remote Event bridge、locale service 与 Host [`user-approval`](../../interaction/user-approval/README.zh.md) 包的 Web 组合中。browser row 没有包配置；其 `./client` entry 提供交互界面。

### 请求流程

当带有 Session owner 的作用域化 `approval/request` 到达时，插件创建 pending presentation 并替换 `conversation.composer` fallback。面板显示请求 reason，或显示包含 tool name 的本地化 escalation message；当存在 `callId` 时呈现关联 detail，并在用户选择操作后返回 `allowed-once` 或 `rejected`。

没有 Session scope 的请求会立即调用下一个 waterfall listener。当 pending presentation 被销毁、中止或无法回答时，listener 也会 delegate，因此 Host 可以使用其他 answerer，或以 fail-closed 方式结束。

### 扩展 detail

本插件声明 `conversation.approval.detail` 为 Session 作用域的 single child Slot。扩展可以为该 Slot 注册 renderer，并收到 `ApprovalDetailOwnerProps.callId`；审批包拥有请求生命周期，扩展只拥有关联 Tool 的呈现。

### 失败与生命周期行为

`PendingApproval.result` 会一直 pending，直到用户回答、request signal abort 或 owner delegate。每条 terminal 路径都会移除 abort listener，并且只 resolve 或 reject 同一个 promise 一次。插件或 Session teardown 会先 delegate 等待中的请求，再等待 owner completion，最后移除可见的 pending interaction。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host entry 是一个空的 browser-only loader body。Client entry 注册 `approval` locale namespace，以 precedence `0` 通过 `uiSession` 发布 `PendingApproval`，并向 `conversation.composer` 注入 priority 为 `1` 的 chain occupant。其 selector 只匹配本包的 pending-interaction discriminator，因此其他 question 或 plan presentation 仍由各自 consumer 提供。

`PendingApproval` 拥有一个请求的 identity、Session id、可选 Tool call id、reason、abort signal 与一次性 settlement。`answer()` 用所选决定 resolve Remote Event；`delegate()` 以内部 marker reject，listener 将其转换为 `next()`；`abort()` 转发 transport 或作用域失败。`ApprovalPanel` 在第一次尝试后禁用 action button；如果 settlement 报错，则重新启用。

所有产品可见文案来自 `approval` locale dictionary。只有请求带有 `callId` 时才呈现可选 detail Slot；该 Slot 不收到 approval resolver，因此 detail renderer 不能回答或改变 Host 决定。

### 源码索引

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 仅浏览器插件的 Host loader entry |
| [`src/client/index.ts`](src/client/index.ts) | locale 注册、pending-interaction 发布、composer chain 与 Remote waterfall listener |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | approval request、decision、pending settlement 与 detail Slot contract |
| [`src/client/ApprovalPanel.tsx`](src/client/ApprovalPanel.tsx) | 本地化 approval composer 与可选 detail renderer |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文审批文案 |
| [`tests/ui-approval.client.spec.tsx`](tests/ui-approval.client.spec.tsx) | pending settlement、delegate、abort、Slot 选择与组件行为 |

本包不发布 `./invariant` companion，因为 Remote listener、locale namespace、pending domain 与 Slot registration 由 Cordis 注册表所有；本包没有会与这些 owner 分歧的独立 observation。

</details>

<a id="further-exploration"></a>
## 进一步探索

如果需要了解 Host 决定、Session 交互注册表与 composer 扩展点，请阅读以下页面。

- [user-approval](../../interaction/user-approval/README.zh.md)——拥有 Host approval outcome、策略与 fail-closed 决策服务。
- [ui-session](../ui-session/README.zh.md)——投影 pending interaction，并拥有 Session 作用域 UI source。
- [ui-conversation](../ui-conversation/README.zh.md)——声明 `conversation.composer` chain 及其 owner props。
- [Web Client Slots](../../../docs/subsystems/slots.zh.md)——定义 Slot 声明、作用域、子项所有权与生命周期。
- [Approval 子系统](../../../docs/subsystems/approval.zh.md)——说明 `approval/request` waterfall 与 outcome 词汇。

聚焦审批详情区域后，Enter 批准，Esc 拒绝。插件挂载期间，这两个按键不能分配给可编辑快捷键。聚焦“拒绝”按钮后，Enter 保留按钮原生拒绝操作。输入控件与输入法候选保留各自的按键。键盘和指针操作共用同一待处理请求锁；已撤销或替换的请求不能再次作答，较早请求的失败也不会解锁替代请求。

<a id="model-experience"></a>
## 模型体验

无，因为本包只在浏览器中呈现审批请求，不注册任何面向模型的内容。

#### KV Cache 影响

无；审批请求和响应的呈现不会改变模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **只提供一次性决定**——UI 返回 `allowed-once` 或 `rejected`；记住的授权、撤销与持久权限策略属于 Host 包。
- **呈现受 Session 作用域限制且只存在于进程内**——没有 Session 的请求会 delegate，浏览器组合重启也不会从 Session log 重建旧的 pending panel。
- **Tool detail 是可选的**——只有请求携带 `callId` 时才提供 detail child Slot；没有该 identity 时，审批包不能合成 Tool view。

- **面板只提供临时决定**——它支持仅本次允许和拒绝；持久权限策略仍由 Host 侧审批包拥有。请求方提供的本地化展示文案跟随界面语言，不改写审计原因，也不翻译模型生成的文本。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
