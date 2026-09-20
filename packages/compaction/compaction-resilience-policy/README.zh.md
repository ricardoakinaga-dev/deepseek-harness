---
description: "为需要约束本地模型行为的部署提供按用途生效的压缩截止时间、输出与推理限制，以及 agent loop 请求上下文准入。"
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-resilience-policy

[English](README.md) | 中文

## 概述

此包会在适配器遵守取消信号时约束缓慢的压缩请求，并在适配器执行昂贵工作前拒绝已经超过日志所记模型容量的 agent loop（智能体循环）请求。压缩调用获得可配置的输出上限、可选推理强度和协作式总截止时间。普通模型调用保持其请求选项不变。如果希望采用经过测试的本地模型默认值而不编辑 profile 树，请选择可安装的 [`dsh-resilient-compaction`](../../bundle/resilient-compaction/README.zh.md) 组合包。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在宿主平面挂载一次此插件。它的全局 `llm/stream` waterfall（瀑布式事件）监听器也会接收 agent preset 领域内引擎发出的压缩调用。

### 何时选择它

对于自托管或吞吐受限的模型，如果较大的摘要输出、继承的高推理强度或长时间运行的流会让自动压缩看起来卡死，请选择此策略。如果另一个部署层已拥有按用途划分的 LLM（大语言模型）限制，请不要重复安装，或只配置该层未拥有的控制项。请求预检依赖官方会话与 token-meter 服务；它不会估算无关的手工构造调用。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-compaction-resilience-policy'
  config:
    compactionMaxTokens: 4096
    compactionReasoningEffort: 'off'
    compactionTimeoutMs: 480000
    requestPreflight: true
    requestSafetyMarginTokens: 256
    requestOutputReserveTokens: 1024
```

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `compactionMaxTokens` | `4096` | 应用于 `purpose: compaction` 请求的上限，且不会提高调用方更小的上限 |
| `compactionReasoningEffort` | 未设置 | 仅应用于压缩的非空适配器强度 id；所选模型必须公布该值 |
| `compactionTimeoutMs` | `480000` | 一次压缩流的协作式总截止时间（毫秒） |
| `requestPreflight` | `true` | 为 `dsh-agent-loop` 标记的请求启用容量检查 |
| `requestSafetyMarginTokens` | `256` | 加到预计请求上的额外上下文余量 |
| `requestOutputReserveTokens` | `1024` | agent loop 请求没有显式 `maxTokens` 时采用的输出预留 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-resilience-policy)是所有受支持字段的完整来源。

### 结果与恢复

过大的 agent loop 请求会在适配器分派前以规范的 `CONTEXT_WINDOW_EXCEEDED` 代码结束。官方 `compaction-basic` 请求错误处理器随后可以修剪或压缩持久表面并重试。只有在下游适配器观察到取消并完全停稳后，压缩截止时间才以 `COMPACTION_TIMEOUT` 结束；更早发生的调用方取消仍是普通的 aborted 结束。不可变压缩请求会以 `COMPACTION_POLICY_IMMUTABLE_REQUEST` 快速失败，因为静默绕过已配置控制会重新引入卡死风险。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

此策略只使用公共扩展点：全局 `llm/stream` waterfall、`ctx.sessions` 和 `ctx.tokenMeter`。agent loop 身份按进程内的精确对象记录，因此预检不会把辅助请求误认为对话步骤。最新记录的 `request/context` 提供相匹配的提供方、模型与上下文窗口；token 测量提供持久输入估算；请求的输出上限与配置余量构成完整预计值。

压缩请求字段只在下游流活动期间修改，并在 `finally` 中恢复，包括消费方提前返回的情况。截止时间把调用方取消与策略自有的超时原因融合，绝不会让适配器与被遗弃的 promise 竞速。此包不发布 invariant 配套插件：该无状态监听器同步读取单个请求和同一会话的快照，不拥有可能发生分歧的独立变化关系。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置校验、请求准入、压缩选项生命周期与超时转换 |
| [`tests/policy.spec.ts`](tests/policy.spec.ts) | 确定性的流、持久区间、取消、容量、dispose 与 Loader 路径覆盖 |
| — | 无 invariant 配套插件；此包不拥有持久或独立观察的关系 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [压缩子系统](../../../docs/subsystems/compaction.zh.md)——压缩事件与后端行为。
- [Token-meter 子系统](../../../docs/subsystems/token-meter.zh.md)——请求准入使用的回放感知估算。
- [弹性压缩组合包](../../bundle/resilient-compaction/README.zh.md)——使用本地模型默认值安装到 profile。
- [Fork 提取指南](../../../docs/customization/fork-v2-extraction.zh.md)——fork 每项重要功能的处置方式。
- [按用途划分的弹性 Agent Note](../../../.agents/notes/implemented/bug-fix/2026-09-03-purpose-scoped-compaction-resilience.zh.md)——理由与被否决替代方案。

-----

<a id="model-experience"></a>
## 模型体验

### 辅助压缩请求

#### 模型看到什么

摘要模型收到所选后端提供的相同系统提示词、工具 schema、对话前缀与压缩指令。此策略不改变提示词或消息内容；它只约束已经标为 `purpose: compaction` 的请求生成控制。

#### Token 影响

压缩输出受 `compactionMaxTokens` 限制，且不会提高调用方更小的限制。配置的推理强度可能依适配器增加或减少隐藏推理 token；该组合包选择 `off`，使本地摘要保持有界。

#### KV Cache 影响

前缀稳定：消息、系统提示词与工具 schema 字节不变，因此此策略保留压缩后端已经建立的任何可复用前缀。提供方缓存可用性以及模型或推理选择造成的失效仍由适配器拥有。

### 被拒绝的对话请求

#### 模型看到什么

被拒绝尝试的任何内容都不会到达提供方。如果已安装的压缩后端取得持久进展并重试，模型会在重试中看到该后端的替换检查点。

#### Token 影响

被拒绝的尝试消耗零提供方 token。恢复压缩和重试具有各自所属包定义的正常 token 成本。

#### KV Cache 影响

由于没有提供方请求，被拒绝尝试与缓存无关。后续恢复替换具有压缩后端所记录的缓存影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些约束界定策略刻意委派的情况，以及官方扩展表面无法表达更多细节的位置。

- **超时是协作式的**——忽略 `AbortSignal` 的适配器仍可能无法结算；策略不会遗弃实时提供方工作，也不会在清理仍继续时发出终结结果。
- **准入使用 token meter 的估算**——安全余量会降低估算风险，但无法把启发式分词变成提供方精确计价。
- **容量未知或不匹配时委派**——如果没有实时会话，或最新 `request/context` 与请求的提供方和模型不匹配，则不进行预检。
- **推理强度必须存在于所选模型**——不受支持的配置 id 会以 LLM 服务的 `UNSUPPORTED_REASONING_EFFORT` 结果失败，而不会静默回退。
- **官方压缩来源记录没有推理或超时字段**——`compaction/summary` 记录提供方、模型、输出上限、输出与用量；waterfall 应用的推理选择和成功截止时间不在该事件中表示。此包不发出自定义会话事件，因为可移除组合包不得使其历史日志变得不可读。
- **压缩来源记录仍保留后端请求的上限**——即使此 waterfall 降低适配器请求，当前 `compaction-basic` 结果也会记录其自身配置的 `maxTokens`。完整的有效辅助调用来源需要上游事件／API 扩展，而不是组合包本地事件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

此包有意不包含分层摘要器。多个隐藏模型调用不符合当前单调用 `llmStreamCall` 来源标记；[fork 提取提案](../../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.zh.md)定义了移植该算法之前的先决条件。

</details>
