# 在不分叉 upstream 的情况下提取 deepseek-harness-v2

[English](fork-v2-extraction.md) | 中文

## 概述

[`deepseek-harness-v2`](https://github.com/ricardoakinaga-dev/deepseek-harness-v2) fork 包含有用的实验，但其分支不是 [官方仓库](https://github.com/deepseek-ai/deepseek-harness)之上的可维护更新层：它修改大量包，并把生成的工程产物与运行时工作放在一起。受支持的提取模型是一组只依赖官方公共 API、可独立安装的小型插件和 profile 组合包。首个切片——弹性压缩——已经在这里实现，因为它能修复观察到的本地模型卡死，同时不改变 `agent-loop`、会话格式、随附压缩后端或任何 preset 文件。其余想法按下文分类，有序工程提案位于 [fork 提取 Agent Note](../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.zh.md)。

## 目录

- [比较边界](#comparison-boundary)
- [已实现切片](#implemented-slice)
- [提取矩阵](#extraction-matrix)
- [Upstream 安全的运行模型](#upstream-safe-operating-model)
- [验证](#verification)

<a id="comparison-boundary"></a>
## 比较边界

官方包、事件格式、profile 组合包和 preset 组合保持为真源。Fork 代码是行为与失败案例的证据，不是要合并的分支。候选项只有在具有单一所有者、使用已记录扩展点、保持会话重建、校验部署调节项、具备确定性生命周期测试，并且移除后不会让已存储会话变得不可读时，才能跨过该边界。

2026-09-03 的审查比较了官方 [`dsh-v0.1.3-alpha.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1) 线与 fork 的 [`master`](https://github.com/ricardoakinaga-dev/deepseek-harness-v2/tree/master) 分支，比较起点为它们的共同祖先。官方一侧有 1,834 个独有提交，fork 一侧有 12 个；fork 相对祖先的 diff 涉及 1,624 个文件和 139,837 行新增，因为运行时变更旁还包含大量生成的工程与协调语料。因此，提交与行数描述的是分叉成本，而不是值得移植的产品行为量。

Fork 的压缩工作正确强调快速失败的摘要、过大请求预防、回放恢复和有界降级。官方仓库已经提供摘要截断时的快速失败、无模型工具结果修剪、持久表面替换、规范 `CONTEXT_WINDOW_EXCEEDED` 恢复、OAuth 提供方支持、结构化 shell／子进程结果以及输出 spill。这些能力继续由 upstream 拥有，不重复实现。

<a id="implemented-slice"></a>
## 已实现切片

[`@deepseek-ai/dsh-compaction-resilience-policy`](../../packages/compaction/compaction-resilience-policy/README.zh.md) 包装公共的全局 `llm/stream` waterfall（瀑布式事件）。对于辅助压缩，它会限制输出，选择可选的低成本推理强度，融合协作式总截止时间，并在流结算后恢复调用方请求。对于 agent loop（智能体循环）构造的对话请求，它会组合最新持久 `request/context`、回放感知 token meter、输出预留和安全余量；不安全的预计值会在提供方分派前返回规范上下文溢出，使官方恢复逻辑可以压缩并重试。

[`@deepseek-ai/dsh-resilient-compaction`](../../packages/bundle/resilient-compaction/README.zh.md) 把该策略安装为可选 profile 层。该层使用全局交付，因为 Web 压缩引擎位于 agent preset 领域内。它不复制 preset，也不替换官方服务，因此 `compaction-basic` 与随附 preset 的 upstream 变更仍会正常到达。

<a id="extraction-matrix"></a>
## 提取矩阵

| Fork 区域 | 官方重叠 | 处置 |
|---|---|---|
| 压缩快速失败与回放恢复 | `compaction-basic` 已经拒绝截断／无效摘要，并且只在持久表面取得进展后重试 | 保留官方实现；不添加重复后端 |
| 过大请求预防 | Agent loop 请求暴露精确身份；会话记录路由容量；token meter 暴露回放压力 | 已作为 `compaction-resilience-policy` 的分派前策略实现 |
| 压缩输出、推理与耗时限制 | `purpose: compaction` 与协作式信号是公共接口；目前没有随附的用途策略 | 已作为全局 LLM（大语言模型）策略和可选组合包实现 |
| 分层多调用摘要 | 当前 `compaction/summary.llmStreamCall` 标识一次辅助调用 | 延期到 upstream 会话事件能够表示每次中间调用；绝不把调用隐藏在单调用标记后 |
| 质量与本地评估框架 | 官方会话事件与投影可以承载证据，但 fork 混合了评分、策略与报告 | 仅拆分为带独立提供方与消费方的完整评估 seam；不移植单体实现 |
| Upstream 协调更新器 | 官方组合包、profile patch、包管理器更新与 Git 已经拥有组合及源码更新 | 不交付进程内 Git 更新器；它在 agent 沙箱外执行并重复受信工具 |
| 扩展完整性与安全 manifest | Loader 包具有清单与生命周期所有权，但同进程插件仍拥有宿主权限 | 为 loader 提案保留 manifest（元数据清单）／完整性想法；不把哈希描述成沙箱隔离 |
| 脱敏启发式 | 会话遥测暴露 redact waterfall，而持久化与模型输入具有不同所有者 | 为每个显式数据流设计一个策略；不跨无关边界应用启发式变更 |
| 结构化执行结果与保留输出 | 前台 Bash／PowerShell 与子进程层已经暴露退出、信号、超时、截断和 spill 事实；持久 PTY 工具仍返回字符串，而通用工具值不是持久事件 | 保留官方 schema；把持久工具对齐作为带有持久结果元数据的聚焦 upstream 变更，而不是移植 fork 的通用时间戳／UUID 分类器 |
| Web 传输与工作流控制文件 | 官方 Web 与工作流 seam 已经存在持久生命周期事件 | 分别评估具体缺失操作；不从 fork 整体替换任一 seam |
| 安全、发布与 Linux 就绪门禁 | 官方分支已有 1,834 个后续提交，当前仓库门禁拥有这些策略 | 在当前 upstream 上复现具体缺失失败后再移植聚焦门禁；不复制历史审计输出或过时门禁清单 |
| 生成的 `.agent`、`.upstream` 与 gauntlet 产物 | 仓库门禁与 Agent Note 拥有验证和决策 | 从运行时包与组合包内容中排除 |

<a id="upstream-safe-operating-model"></a>
## Upstream 安全的运行模型

把定制包放在定期 rebase 或合并官方默认分支的分支／仓库中，不复制官方源码。独立发布每个行为包，并让一个小型组合包依赖所选集合。组合包 patch 插入新 id，而不是重写现有配置项；用户或部署 patch 仍是后续层。每个新切片都必须说明它消费哪个公共事件／服务、写入哪些持久事实、移除会如何影响历史会话，以及它有意不重复哪项官方能力。

需要修改冻结的 agent loop 请求、创造未注册会话事件、复制随附 preset、猴子补丁服务实例，或从 harness 内部启动受信更新命令的想法尚未达到组合包条件。其先决条件应作为狭窄公共扩展或持久词汇变化进入 upstream，并在构建可选实现前完成记录。

<a id="verification"></a>
## 验证

该策略具有确定性测试，覆盖压缩选项生命周期、受支持推理选择、协作式超时分类、上游取消、不可变请求、精确容量准入、不进入适配器的溢出拒绝、HMR（热模块替换）dispose 与 Loader 导出处理。集成用例让官方压缩引擎通过静默结束的协作式适配器运行，并证明超时会用 `compaction/end` 关闭持久 `compaction/start` 区间。无密钥 headless [会话录制场景](../../snapshots/session/resilient-compaction-timeout/session.jsonl)验证从预检拒绝到相同持久关闭的完整 profile 路径。组合包测试使用生产 schema 解析已声明 patch，并固定其依赖和默认值。仓库类型、lint、文档、包、构建与安装布局检查仍是验收路径；[提案](../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.zh.md)定义后续切片需要的额外证据。
