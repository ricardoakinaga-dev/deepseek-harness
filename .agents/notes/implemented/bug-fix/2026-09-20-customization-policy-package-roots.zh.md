# Agent Note: 拒绝非打包扩展记录中的包根目录

Status: implemented

[English](2026-09-20-customization-policy-package-roots.md) | 中文

## 问题

customization-policy 验证器只在扩展解决方案类型发布包源代码时验证 `packageRoots`。对于 `configuration`、`profile-patch` 和 `skill` 记录，它会静默接受该字段，因此非打包记录可以声明包源代码所有权，却没有无效夹具失败。

## 决策

当扩展使用 `configuration`、`profile-patch` 或 `skill` 时，验证器拒绝 `packageRoots`。打包扩展类型仍然必须声明非空的 `packages/<...>/` 根目录，不带该字段的现有记录继续有效。聚焦策略套件为每种非打包解决方案类型增加一个无效夹具，并保留打包扩展的有效夹具。

此改动仍属于现有 upstream-safe customization governance 所有者下的 `repository-automation`。它只修改策略验证和测试，不改变运行时包、profile 或已发布的 Session 数据。

## 考虑过的替代方案

**忽略非打包解决方案类型中的该字段。** 不予采纳，因为被忽略的所有权字段会产生假绿的策略记录。

**允许非打包记录声明包根目录。** 不予采纳，因为 configuration、profile-patch 和 skill 记录不拥有包源代码，并且必须在不归属包源代码的情况下保持可移除。

## 影响

当非打包扩展声明包根目录时，策略记录现在会在验证阶段失败。诊断指出记录、字段、解决方案类型和修正方式。打包扩展仍保留将变更路径与其声明根目录比较的源代码包含检查。

## 测试

聚焦策略套件通过现有有效与无效分类用例以及三个新的禁止 packageRoots 用例。规则和夹具更新后，顶层验证器与 customization 归属检查均通过。
