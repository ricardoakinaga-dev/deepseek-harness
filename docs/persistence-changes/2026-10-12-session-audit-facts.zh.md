---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-12-session-audit-facts

[English](2026-10-12-session-audit-facts.md) | 中文

## 概述

记录持久交付副本、启动器配置事实、沙箱执行语义和已确认的本地子代理权限。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-12-session-audit-facts
baseline: false
changes:
  - root: "event:deliverables/presented"
    previous: "2026-09-11-initial"
    after: "c2562179620a32b65cc7d1d163604db65c4332fd207e8d4e9b1bb1c48241ef1d"
    decision: same-version
  - root: "event:runtime/audit"
    previous: null
    after: "3816f7d08fae774bf2d0952c3fbc160f07a74af1490ab5e217e3452bc0907ffe"
    decision: same-version
  - root: "event:sandbox/environment"
    previous: null
    after: "0237cf86dfd53b683c593cedef2e36d1721787cc3af7bbc74249b98f0327c9d9"
    decision: same-version
  - root: "event:subagent/authority"
    previous: null
    after: "25cc6c357d85dc66217a19e4d95bd2aaa5032de5e3e36ee99667d0c956a86ff2"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

交付记录的 capture 字段可选，因此已有记录仍然有效；缺少该字段表示未记录不可变副本。当前读取器识别三个新增的普通事件类型。较旧读取器会拒绝这些未知事件，本次添加不承诺降级可读性。事件封装和 Session 头版本保持不变。

<a id="verification"></a>
## 验证

交付和下载专项测试 54 个通过。沙箱提供方和策略测试 61 个通过，另有 8 个真实 bubblewrap 测试通过。设置审计测试 57 个通过，覆盖配置重载、导出值和秘密排除。本地子代理权限及继承测试 47 个通过。录制会话集成回放仍须单独验证。

<a id="dev-note"></a>
## 开发备注

无。
