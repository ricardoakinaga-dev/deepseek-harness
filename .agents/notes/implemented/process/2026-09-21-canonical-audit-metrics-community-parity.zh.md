# Agent Note: 规范审计指标与英文规范社区渠道一致性

Status: implemented

[English](2026-09-21-canonical-audit-metrics-community-parity.md) | 中文

## Problem

审计程序只有探索性的源代码计数，没有机器可读的语料库、固定计数规则或保留的环境信息。根目录英文和中文 README 还宣传了不同的社区渠道，因此翻译检查无法区分已批准的本地化内容与语义漂移。

## Decision

`pnpm run audit:metrics` 输出经过验证的 JSON 文档，其中包含 schema 版本、版本标识、采集时间、运行环境、语料库清单，以及命名的 `deprecated_reader`、`lint_suppression`、`todo_marker`、`explicit_any` 和 `selected_skip` 计数。语料库包含 `packages/`、`apps/`、`scripts/`、`python/`、`native/` 和 `benchmarks/` 下受 Git 跟踪的源文件；排除生成、构建、依赖、vendor、快照和保留产物路径。每个计数都是源代码行匹配，并在结果旁记录所用规则；排序后的文件清单由摘要表示。

`README.md` 拥有根目录社区渠道清单。`README.zh.md` 翻译该清单并宣传相同的三个目标。`pnpm run verify-readme-community-parity` 比较两个指定章节中的精确 HTTP(S) 目标，缺少目标或出现仅本地化目标时失败。一致性检查属于文档快速聚合命令和完整聚合命令。

## Alternatives considered

**保留仅中文的企微和微信渠道。** 不采用，因为维护者选择英文 README 作为规范渠道来源，并要求本地化页面完全一致。

**使用没有解析语料库的递归工作区 glob。** 不采用，因为生成文件、vendor 文件和未跟踪文件会使重复计数无法比较。

**发布没有共享 schema 的独立计数文件。** 不采用，因为消费者无法验证结果关联的版本、环境、语料库或计数规则。

## Consequences

静态债务趋势只有在命令、语料库和计数规则保持不变时才可比较；这些指标是基于行的指标，不是 AST 分类。英文社区清单发生变化时，必须同步更新中文 README 及其配对记录，一致性门禁会拒绝缺少目标或额外的本地化目标。

## Testing

专门的 Vitest 测试覆盖正面和负面的指标夹具、无效的保留输出、精确目标一致性、缺少目标、额外目标和章节结束位置。传入 `--output` 时，命令会写入保留的 JSON 产物；针对根目录 README 配对运行时，一致性命令通过。
