---
kind: upgrade-guide
description: "Plugin Manager 拒绝停用恢复插件配置所需的界面和设置依赖。"
---

# 保留插件管理界面

[English](guide.md) | 中文

## 变更

Plugin Manager 在已有保护服务之外，还保护其 Web 界面所需的设置、布局、渲染、侧栏和语言组件。此前可以停用这些依赖的调用现在返回 `management-required`。内置插件开关在写入前展示相同限制，普通可配置插件仍可编辑。

## 迁移

1. 调用 `setPluginEnabled` 的客户端必须遵守 `listPlugins().readOnlyReason`；预设客户端使用 `listPresetPlugins()` 和 `setPresetPluginEnabled()`。
2. 如果旧测试配置显式停用了管理依赖，在打开 Web 界面之前，删除其 `cordis.patch.yml` 中对应的覆盖。
3. 打开 **More → Settings → Built-in plugins**，确认可编辑条目的开关可操作，管理依赖的开关被禁用并显示原因。预设更改对新会话生效。
