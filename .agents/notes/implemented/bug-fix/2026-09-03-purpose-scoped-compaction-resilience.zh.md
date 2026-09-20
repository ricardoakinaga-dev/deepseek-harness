# Agent Note: 核心循环之外按用途划分的压缩弹性

Status: implemented

[English](2026-09-03-purpose-scoped-compaction-resilience.md) | 中文

## 问题

当摘要器继承昂贵的推理默认值、请求较大的输出额度且没有压缩专用总截止时间时，本地 OpenAI 兼容模型可能让自动压缩看起来卡死。受影响会话会记录 `compaction/start`，但辅助流结算前无法记录 `compaction/end`。官方后端已经拥有安全区域选择、修剪、摘要校验、持久替换与上下文溢出恢复；复制或编辑这些机制会形成第二套随 upstream 漂移的压缩实现。

Fork 展示了有用的请求大小与压缩控制，但其实现改变循环和许多无关包。可选修复需要触达 Web preset 领域内挂载的压缩引擎，保持可移除，并保留官方会话格式与提供方生命周期。

## 决策

`@deepseek-ai/dsh-compaction-resilience-policy` 是建立在公共全局 `llm/stream` waterfall（瀑布式事件）之上的无状态宿主插件。对于标为 `purpose: compaction` 的可变请求，它限制 `maxTokens` 而不提高更小的上限，应用可选的适配器自有推理强度，并把调用方信号与可配置总截止时间融合。包装层等待下游结算，只把自身超时转换为 `COMPACTION_TIMEOUT`，并在 `finally` 中恢复每个临时请求字段。不可变压缩请求会快速失败，因为插件无法安全应用其声明的控制。

对于携带精确进程内 `dsh-agent-loop` 标记的请求，插件读取实时会话最新且匹配的 `request/context` 以及回放感知 token meter。它预计输入 token 加请求输出额度或配置的回退值，再加安全余量。超过日志上下文窗口的预计值会在适配器分派前返回规范 `CONTEXT_WINDOW_EXCEEDED`。现有请求错误压缩策略仍是修剪、摘要、进展证明与重试的唯一所有者。

`@deepseek-ai/dsh-resilient-compaction` 把该策略安装为采用本地模型默认值的可选 profile 组合包：4,096 输出 token、推理强度 `off`、480 秒截止时间、请求准入、256-token 余量与 1,024-token 回退输出预留。监听器是全局的，因此一次宿主插入即可接收常驻 preset 组合内压缩引擎的调用。输出额度足以让经过验证的本地模型完成官方结构化检查点提示词；达到更小上限而截断的结果不能视为成功摘要。组合包插入新配置项，不复制或修改任何官方 preset。

插件不发出自定义会话事件。公共 `Session.append` API 无法把插件定义事件标为可忽略，因此这种事件会在移除组合包后使历史日志不可读。当前 `compaction/summary` 来源记录也无法记录有效推理选择，或区分 waterfall 降低的上限与后端请求上限；在 upstream 词汇扩展存在之前，该限制保持明确。

本决策扩展[压缩能力 seam](../feature/2026-06-18-compaction-capability-seam.zh.md)、[回放 token meter](../../archived/architecture/2026-07-15-replay-token-meter-service.md)、[上下文溢出恢复](../architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.zh.md)、[可重建请求](../architecture/2026-07-05-reconstructable-requests.zh.md)与 [profile 组合包](../architecture/2026-08-05-profile-plugin-bundles.zh.md)决策。每项仍保持活动并拥有更广泛约定；重叠只是部分关系，因此没有任何一项被完全取代或适合归档。

## 考虑过的替代方案

**合并 fork 的压缩栈。** 被否决，因为它改变核心请求构造，并携带广泛分叉的包图。官方后端已经拥有大部分安全行为，因此合并会重复当前机制并增加 upstream 更新成本。

**修改 `agent-loop` 以添加请求预检事件。** 对这个可选修复予以否决，因为 `llm/stream`、agent loop（智能体循环）请求身份、`request/context` 与 token meter 已经提供足够准入事实。循环变化会为单个部署策略扩大核心约定。

**复制每个随附 preset 并降低 `compaction-basic.maxTokens`。** 被否决，因为复制的 preset 是会漂移的完整快照。全局监听器无需复制组合即可触达每个 preset 领域。

**让提供方与计时器竞速并立即返回。** 被否决，因为被遗弃的提供方工作可能继续消耗资源，并在调用方看到终结结果后改变状态。截止时间采用协作方式，只在下游迭代器结算后返回。

**在一个 `llmStreamCall` 标记后移植分层摘要。** 被否决，因为当前持久标记只标识一次辅助调用。隐藏中间调用会破坏请求重建与用量来源记录。

## 测试

确定性假计时器测试覆盖超时所有权、上游取消、下游结算、信号与选项恢复、不可变请求、受支持推理选择以及上限单调性。集成测试让官方压缩引擎通过在取消后静默结束的协作式适配器运行，并验证策略超时会产生与之配对的持久 `compaction/end`。无密钥 headless 会话录制场景覆盖完整 profile 路径：工具结果跨过新记录的容量，预检阻止第二次适配器分派，官方恢复开启压缩，策略截止时间将其关闭。真实会话与 token-meter 测试覆盖精确容量准入、路由不匹配、预检禁用、全局监听器 dispose（资源释放）以及 Loader 具名导出处理。组合包测试使用生产配置项 schema 解析其声明的 patch，并固定依赖及每个配置值。

## 后果

本地部署可以约束导致观察到卡死的精确辅助调用，同时继续使用官方压缩引擎与 preset。过大的 agent loop 请求会在提供方工作前失败，并通过规范错误代码进入官方恢复路径。普通模型调用保持不变，移除组合包不会增加无法读取的持久词汇。

该策略仍受限于协作式适配器与启发式 token 测量。不公布配置推理强度的模型会明确拒绝它。成功压缩记录保留后端请求上限并省略推理与截止时间事实，因此完整有效的辅助调用来源记录仍是 upstream 先决条件，而不是组合包宣称已解决的能力。
