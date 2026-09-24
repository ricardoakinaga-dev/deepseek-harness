---
description: "面向 Session Controller 列表、交互状态与逐会话上下文的 React 与 Slot 适配器。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-session

[English](README.md) | 中文

## 概述

挂载本插件即可通过标准 Slot 输入公开 Session catalog、retain 信息、统一 UI 状态与 Session 作用域 source。本插件把 `ClientSessions` 连接到 renderer，但不会把 React hook 放进 Session model；领域插件可以添加类型化 source 或 pending interaction。`SessionProvider` 可以继承外围 binding，也可以指向显式的 `SessionReference`；Controller transport、历史与 reference 仍由 Session Controller 所有。

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

将 `@deepseek-ai/dsh-client-ui-session` 挂载到已经提供 Session Controller、Remote Events、Slot 注册表与 UI renderer 的 Web 组合中。本插件没有包配置；其 browser entry 安装 root source 以及 `session` 与 `session-maybe` 作用域 adapter。

### Root Session 输入

每个呈现作用域都可以收到 `useSessions`、`useSessionStatus` 与 `useSessionRetainInfo`。前者选择 Controller 列表与当前选中项，第二个按 Session id 选择 running、pending-interaction 与完成提醒状态，第三个读取 reference 计数而不 retain Session。

root source 不会按列表顺序选择全局 current Session。它跟随由 `mainView` retain 的 Session；该 retain 消失时，它会选择仍拥有 `mainView` 的另一个 Session，否则发布 absent binding。

### Session 作用域输入

声明 `session` 或 `session-maybe` 子 Slot 即可收到 `SessionProvider`。Provider 没有显式 reference 时继承外围 binding。显式的 `SessionReference` 会让该子树指向对应 Session，而 `undefined` 会为 `session-maybe` 子项选择 absent 分支。严格的 `session` 子项需要 binding；`session-maybe` 子项提供可选的 `sessionId`、`useSession` 与 `useProjection` 结果。

每个 Session binding 还提供内置的 `useSession` source、`sessionId` 与 keyed `useProjection` source。一个 Controller 所有的 `SessionBinding` 在其存活期间保持 source 稳定，并在该 generation 结束时切换为 absent projection。

### 领域贡献

领域插件可以调用 `ctx.uiSession.provide()` 添加 Session 作用域的 observable hook、keyed hook 或普通 prop。必须在 descriptor roster 中声明每个名称，并从 `resolve(binding)` 返回所有声明值。adapter 会拒绝未声明值、缺失值、重复生成的 prop 名称与贡献方之间的冲突。

对需要回答的 Session 交互使用 `ctx.uiSession.registerPendingInteraction(precedence)`。发布带有 delegation callback 的值；返回的 disposer 会移除该值。对每个 Session，adapter 通过 `useSessionStatus` 暴露当前最高优先级的 published interaction，并在 domain 被销毁前 delegate 活跃值。

### 失败与生命周期行为

对于没有 reference 或已经 inactive 的 adapter，`bindingSource(reference)` 返回 absent source；来自另一个 active Controller generation 的 reference 会被拒绝。已 release 的 reference 不会静默重新绑定到同一 Session id 的替换项。新的 materialized snapshot 提交后才通知 source listener，并且一个 listener 失败不会阻止其他 listener 运行。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`UiSession` 拥有一个 root source、一个 current-main source、一个 absent projection，以及每个存活 `SessionBinding` 一个稳定 source。它订阅 Controller 列表和作用域化的 `api-session/status` event，然后根据最新 list baseline、running 变化、pending interaction 与完成提醒发布状态。renderer 经 `SlotScopeAdapter` 消费这些裸 source；任何 component 都不会收到 `Context` 或 Session model hook。

source materialization 会把内置的 Session、projection 与 identity 值和领域 descriptor 合并。descriptor 通过 Cordis effect 注册，因此销毁会移除贡献并重建每个 live binding。binding cleanup 只把对应 generation 的 source 改为 absent，从而阻止旧 Context 使同 id 的替换项失效。

pending-interaction domain 把 owner delegate 与 transient value 一起保存。domain teardown 先移除可见值，再等待每个 delegate，因此等待中的 Remote waterfall 可以在 domain effect 完成前继续。`SessionPendingInteractionMap` 的 declaration merge 让每个 UI feature 可以贡献自己的 discriminated pending value，而不需要把 feature contract 集中到一处。

### 源码索引

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 仅浏览器适配器的 Host loader entry |
| [`src/client/index.ts`](src/client/index.ts) | root 与 Session 作用域 source、状态投影、provider adapter 与扩展 API |
| [`src/client/session-provider.tsx`](src/client/session-provider.tsx) | 空 binding 与绑定 Session 的呈现分支 |
| [`tests/ui-session.client.spec.ts`](tests/ui-session.client.spec.ts) | source identity、作用域、状态、贡献、pending interaction 与销毁行为 |

本包不发布 `./invariant` companion，因为 adapter 的 source identity 与 effect disposal 由其 service 测试直接观察；需要独立 invariant 的关系则由各自的注册表所有。

</details>

<a id="further-exploration"></a>
## 进一步探索

如果需要了解本 adapter 实现的 model 层、renderer 与 Slot 规则，请阅读以下页面。

- [Session Controller](../../api/session-controller/README.zh.md)——拥有 Client Session model、reference、baseline 与 transport。
- [ui-slots](../ui-slots/README.zh.md)——定义标准 props、作用域 adapter 与 Slot 注册生命周期。
- [ui-renderer](../ui-renderer/README.zh.md)——把本 adapter 的裸 source 绑定为 React hook。
- [Web Client 架构](../../../docs/subsystems/web-client.zh.md)——说明 Session model、adapter 与呈现包的归属。
- [Web Client Slots](../../../docs/subsystems/slots.zh.md)——规定 `session`、`session-maybe`、Provider 与 source 贡献。

<a id="model-experience"></a>
## 模型体验

无，因为本包适配浏览器侧 Session 状态，不注册任何面向模型的内容。

#### KV Cache 影响

无；Session selector、状态 source 与 Slot scope 不会组装模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **Pending interaction 只存在于进程内**——它们不会从 Session log 重建；浏览器组合重启后，所属 Remote waterfall 必须再次发布等待中的请求。
- **Session source 依赖 active Controller generation**——来自其他 generation 的 reference 会被拒绝，结束的 generation 会发布 absence，不会静默跟随同 id 的替换项。
- **领域 source 需要声明 roster**——贡献方不能从 `resolve` 添加任意 hook、keyed-hook 或 prop 名称；descriptor 与 declaration merge 必须同步更新。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
