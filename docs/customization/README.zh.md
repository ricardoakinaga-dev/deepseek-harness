# 定制

[English](README.md) | 中文

## 概述

本目录记录无需维护官方包分叉副本即可扩展 DeepSeek Harness 的受支持方式。可安装组合优先使用 profile 组合包，公共扩展点上的行为使用普通 Cordis 插件，需要新的提供方／消费方约定时则使用完整能力 seam。

## 内容

- [上游安全的定制方式](upstream-safe-customization.zh.md)——永久分支拓扑、更新步骤、可执行的差异所有权和可复用的改进模型。
- [Fork v2 实现报告](fork-v2-implementation-report.zh.md)——简明实现结论、已交付产物、验证证据与维护路径。
- [Fork v2 提取](fork-v2-extraction.zh.md)——实验 fork 与官方仓库的比较、已经交付的弹性压缩切片，以及每个其余想法的边界。
- [插件配置教程](../user/develop/basic/config.zh.md)——通过 patch 挂载本地 Cordis 插件。
- [发布组合包](../user/develop/basic/publish.zh.md)——打包 patch 层并安装进 profile。
- [Profile 组合](../../packages/boot/app-boot/README.zh.md)——层顺序、用户 patch 与运行时协调。

## 选择规则

当官方仓库已经暴露行为所需的事件或服务时使用插件。当用户需要把一个或多个插件作为有序 profile 层安装和配置时使用组合包。只有现有公共表面无法保留持久请求事实、生命周期所有权或完整的 Service Definition / Service Provider / Consumer 能力 seam 时，才提议上游扩展。
