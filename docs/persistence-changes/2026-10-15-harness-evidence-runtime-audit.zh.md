---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-15-harness-evidence-runtime-audit

[English](2026-10-15-harness-evidence-runtime-audit.md) | 中文

## 概述

为已交付文件添加可选的已保存副本元数据，添加完整 spill 附件事件，以及运行时执行与配置审计事件，不改变 Session 写入版本。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-15-harness-evidence-runtime-audit
baseline: false
changes:
  - root: "event:deliverables/presented"
    previous: "2026-09-11-initial"
    after: "c2562179620a32b65cc7d1d163604db65c4332fd207e8d4e9b1bb1c48241ef1d"
    decision: same-version
  - root: "event:runtime/audit"
    previous: null
    after: "bfbddb489d486c18d305744d9c46bfb65614c1f7802397c49b73da453c894095"
    decision: same-version
  - root: "event:spill/artifact"
    previous: null
    after: "2819f01f320b79239a22d904d48c4432f743b02054e71f7afb7aeb9982a55cbe"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有 V4 记录仍然有效。缺少捕获元数据表示保存字节的可用性未知，而非可用。运行时审计事件通过 null 或缺失字段保留不可用的历史身份；有效重试策略清单对历史记录为可选。支持这些事件的读取器会识别两个新标签。旧构建可能拒绝新标签；本记录不承诺向前识别，也不允许丢弃必需事件。不改写任何已提交的前代文件或已冻结的确认记录。Launcher 摘要明确描述当前磁盘字节，构建版本来自所观察的嵌入式 manifest；两者均不标识不可用的缓存执行代次。构建输入摘要带有显式的磁盘观察限定符；不推断不可用的编译器已消费输入身份。

<a id="verification"></a>
## 验证

捕获、导出、生命周期与快照规范化的聚焦检查通过（6 个文件共 201 项测试）。运行时身份、配置脱敏、真实 Loader 重载与回滚、watcher 完成状态，以及命名源码 sdk-minimal 持久化与恢复检查通过（21 个文件共 229 项测试）。持久化变化预览将三个根均分类为同版本新增。完整构建配置、SDK 与浏览器集成仍是独立且待完成的验收检查。

<a id="dev-note"></a>
## 开发备注

无。
