# Fork v2 实现报告

[English](fork-v2-implementation-report.md) | 中文

## 概述

本报告记录此检出中有哪些 `deepseek-harness-v2` 改进可用，且不替换 DeepSeek Harness 官方包。按用途限定的压缩限制、协作式超时处理和提供方分派前上下文准入已经实现为可选插件与 profile 组合包。完整 fork 没有被复制：官方能力继续由 upstream 拥有，不安全的替换被排除，需要新持久事实的候选项则保留在经过审查的提案中。

## 目录

- [实现结论](#implementation-answer)
- [已交付扩展](#delivered-extension)
- [本地激活](#local-activation)
- [Fork 处置](#fork-disposition)
- [验证证据](#verification-evidence)
- [后续维护](#future-maintenance)
- [延伸阅读](#further-exploration)
- [开发备注](#dev-note)

-----

<a id="implementation-answer"></a>
## 实现结论

Upstream 安全的压缩改进已经实现。这是选择性提取，而不是合并 fork 的每个文件：复制重复或不兼容的机制会增加偏离，并可能让官方会话、profile 或提供方更难更新。

| 结果 | 范围 |
|---|---|
| 已实现 | 压缩输出上限、可选推理选择、协作式总截止时间、不可变请求失败、过大 agent loop 请求准入、可安装 profile 层和持久恢复快照 |
| 保留官方 upstream | 快速失败摘要校验、无模型修剪、持久表面替换、上下文溢出重试、OAuth 支持、前台 shell／子进程结果和输出 spill |
| 已提议 | 多调用压缩来源记录、拆分后的质量评估、loader 自有完整性元数据、按数据流划分的脱敏，以及按操作划分的 Web／工作流扩展 |
| 需要聚焦 upstream 变更 | 持久终端工具的持久结果对齐；可移除插件不能安全替换已注册的 `bash` 或 `pwsh` 工具 |
| 已排除 | 进程内 Git 更新器、通用时间戳／UUID 执行分类器、复制的 preset、私有字段补丁，以及把生成的工程语料作为运行时内容 |

-----

<a id="delivered-extension"></a>
## 已交付扩展

实现由一个行为包、一个组合包和一个无密钥会话录制用例组成。包 README 拥有配置、安装、失败行为和提供方限制的说明。

- [`@deepseek-ai/dsh-compaction-resilience-policy`](../../packages/compaction/compaction-resilience-policy/README.zh.md)通过公共全局 `llm/stream` waterfall 应用策略，并且只读取公共会话与 token-meter 服务。
- [`@deepseek-ai/dsh-resilient-compaction`](../../packages/bundle/resilient-compaction/README.zh.md)以带本地模型默认值的可选 profile patch 插入该策略。
- [`resilient-compaction-timeout`](../../snapshots/session/resilient-compaction-timeout/session.jsonl)记录预检溢出、官方恢复、压缩超时和与之匹配的持久 `compaction/end`。

该扩展不修改 `agent-loop`、官方 preset、`compaction-basic` 或会话格式。移除组合包不会改动官方 profile 源码，也不会引入插件定义的会话事件。

-----

<a id="local-activation"></a>
## 本地激活

本地 DSH home 已在 `web` 与 `headless` 中安装打包后的组合包。每个 profile manifest 都在官方组合包之后列出 `@deepseek-ai/dsh-resilient-compaction`，每个 profile 的 `pnpm-workspace.yaml` 都把未发布策略依赖映射到 `/home/ricardo/.dsh/packages` 下的本地 tarball。独立 pnpm peer 检查器不会建模父级模块 fallback，因此会把策略 peer 报为缺失；解析后配置检查和一次真实 Web 启动确认 DSH 能够加载它们。两个 profile 均显示带已记录六项值的 `compaction-resilience-policy` 配置项，Web 监听 `127.0.0.1:3080`；启动令牌保持为进程私有，不记录在此处。

-----

<a id="fork-disposition"></a>
## Fork 处置

[提取矩阵](fork-v2-extraction.zh.md#extraction-matrix)是每个已审查 fork 区域的详细所有者。每个候选项必须使用官方公共事件或服务、可移除、保留可回放模型输入，并避免重复 upstream 已维护的能力。[有序提案](../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.zh.md)定义尚未满足这些条件的候选项之前置要求。

-----

<a id="verification-evidence"></a>
## 验证证据

以下检查已针对本检出执行。仓库聚合检查与聚焦行为检查在所记录内容上均通过。

| 检查 | 记录结果 |
|---|---|
| 聚焦策略覆盖率 | 36 项测试通过；语句、分支、函数和行均报告 100% |
| `pnpm exec vitest run packages/bundle/resilient-compaction/tests/resilient-compaction.spec.ts` | 1 项组合包 manifest 与 patch schema 测试通过 |
| `pnpm run test:snapshot` | 82 项 headless 会话录制用例通过，2 项按其声明条件跳过 |
| `pnpm run typecheck` | 通过 |
| `pnpm run lint` | 通过 |
| `pnpm run hygiene` | 16 项通过，0 项失败，0 项跳过 |
| `pnpm run doc-sync` | 32 项通过，0 项失败，0 项跳过 |
| `pnpm run verify-translation-pairing` | 1,128 对双语文档通过 |
| `pnpm run verify-md-links` | 2,259 个 Markdown 文件通过链接与片段校验 |
| 打包 profile 冒烟测试 | 两个未发布 tarball 均经过检查，并通过显式包管理器覆盖一起安装进临时 profile |
| `git diff --check` | 通过 |

-----

<a id="future-maintenance"></a>
## 后续维护

把这些包保持在官方默认分支之上，并在 upstream 更新后重新运行聚焦策略测试、组合包测试、会话录制套件、类型检查、lint、包检查和文档检查。在使用已记录的 `dsh plugin --profile <name> add @deepseek-ai/dsh-resilient-compaction` 路径前发布两个包；源码检出测试使用组合包 patch，因为 workspace 依赖不是外部安装格式。如果部署模型不声明推理强度 `off`，则必须用受支持强度替换完整策略配置，或省略 `compactionReasoningEffort`。

<a id="further-exploration"></a>
## 延伸阅读

- [Fork 提取指南](fork-v2-extraction.zh.md)——仓库比较与决策矩阵。
- [压缩弹性决策](../../.agents/notes/implemented/bug-fix/2026-09-03-purpose-scoped-compaction-resilience.zh.md)——架构原理、替代方案与持久保证。
- [定制索引](README.zh.md)——受支持扩展与组合包选择规则。

<a id="dev-note"></a>
## 开发备注

无。
