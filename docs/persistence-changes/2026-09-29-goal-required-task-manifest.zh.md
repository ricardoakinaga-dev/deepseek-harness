---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-29-goal-required-task-manifest

[English](2026-09-29-goal-required-task-manifest.md) | 中文

## 概述

在 goal 变更载荷版本 2 中持久化必需任务清单。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-29-goal-required-task-manifest
baseline: false
changes:
  - root: "event:goal/change"
    previous: "2026-09-11-initial"
    after: "85a122f576169e68e7896fd5b8d78b6aad15fcd82ebc47fd493ad3a14f6aa041"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已发布的版本 1 载荷保持结构不变且仍可读取。当前写入方发出版本 2，其快照增加可选任务清单，以便表示对历史 goal 的编辑。用户可为没有清单的历史 goal 建立首个范围；该版本 2 快照会记录空的 `originalRequiredTasks`、一项显式范围修订和待处理任务。当前读取方支持带或不带清单的版本 1 和版本 2。旧读取方可能拒绝版本 2；Session header 仍为 V4。

<a id="verification"></a>
## 验证

GoalService、tool-goal、command-goal 和 command-runtime 焦点测试覆盖版本 1 回放、版本 2 写入、目标编辑后重置任务验收，以及命令定义授权。

<a id="dev-note"></a>
## 开发备注

无。
