# 仓库配置报告

[English](repository-configuration-report.md) | 中文

## 概述

本报告记录 `ricardoakinaga-dev/deepseek-harness` 的上游安全配置。此 fork 使用 `master` 作为官方仓库的精确镜像，并使用 `custom/main` 作为受保护的默认集成分支。本地改进登记在机器可读策略中，通过本地检查和 GitHub Actions 验证，并在官方更新后向前合并。此仓库配置不会替换全局安装的 `dsh` 可执行文件。

## 目录

- [已配置拓扑](#configured-topology)
- [保护与自动化](#protection-and-automation)
- [已登记改进](#registered-improvements)
- [验证证据](#verification-evidence)
- [操作限制](#operational-limits)
- [进一步探索](#further-exploration)
- [开发说明](#dev-note)

-----

<a id="configured-topology"></a>
## 已配置拓扑

| 设置 | 已记录配置 |
|---|---|
| Fork | `https://github.com/ricardoakinaga-dev/deepseek-harness.git` |
| 官方来源 | 通过仅拉取的 `deepseek-official` remote 使用 `https://github.com/deepseek-ai/deepseek-harness.git` |
| 镜像 | 本地和 fork 的 `master`，从 `deepseek-official/master` 快进且不含定制提交 |
| 集成 | 本地和 fork 的 `custom/main`，包含已评审的定制提交以及来自 `master` 的 merge commit |
| GitHub 默认分支 | `custom/main` |
| 主题分支 | `custom/<improvement-id>`，基于 `custom/main` 创建并合回该分支 |
| 更新策略 | 快进 `master`，发布该镜像，然后把 `master` 合并进 `custom/main`，不 rebase 永久分支 |

当定制包仍依赖工作区 API、协同测试和官方发布节奏时，仓库保持为单一 fork。[操作步骤](upstream-safe-customization.zh.md)负责克隆设置、更新命令和恢复方式。

-----

<a id="protection-and-automation"></a>
## 保护与自动化

GitHub 保护 `master` 和 `custom/main`，禁止强制推送和删除。默认分支指向 `custom/main`，因此普通 clone 和 pull 工作流会选择持续维护的产品分支，同时官方镜像仍可用于精确比较。

`Customization policy` 工作流会在 `custom/**` 推送以及以 `custom/main` 为目标的 pull request 上运行。它把变更与 `origin/master` 比较，并拒绝未登记的定制路径、重复路径所有权、不兼容的 `kind` 与 `solutionType`、未声明包根目录的包扩展，以及修改其包根目录之外生产包源代码的扩展。

-----

<a id="registered-improvements"></a>
## 已登记改进

| 改进 | 分类 | 所有权 |
|---|---|---|
| 持久 shell 诊断 | `upstream-patch` / `upstream-package-change` | 对官方 shell 工具进行聚焦编辑，并提供提取计划 |
| 弹性压缩 | `extension` / `plugin-and-bundle` | 选择性启用的行为与组合包，以及相应测试、快照和文档 |
| 上游安全定制治理 | `governance` / `repository-automation` | 分支策略、验证器、工作流、agent 规则和定制文档 |

相对于 `master` 的每个定制路径在 [`.agents/customization-policy.json`](../../.agents/customization-policy.json)中恰好有一个所有者。新工作必须在编辑生产代码前遵循[改进开发标准](improvement-development-standard.zh.md)。

-----

<a id="verification-evidence"></a>
## 验证证据

已通过仓库自身命令和 GitHub API 检查配置状态。本地与远端 `custom/main` 解析为同一提交；fork 的 `master` 与 `deepseek-official/master` 解析为同一提交；默认分支和两项保护规则与上表一致。建立此拓扑的配置变更通过了定制验证器及其聚焦测试、受影响包测试、typecheck、lint、build、文档同步和推送前检查。

以下命令提供可重复的当前状态检查：

```sh
git status --short --branch
git rev-parse HEAD origin/custom/main
git rev-parse origin/master deepseek-official/master
node scripts/verify-customization-policy.mjs --base master
```

GitHub 接受 workflow run 只证明已经分派。已完成且为绿色的运行才是精确已推送提交的远端证据。

-----

<a id="operational-limits"></a>
## 操作限制

- 此配置治理仓库历史和定制源代码；它不会安装或替换机器的全局 `dsh` 命令。
- 本地 `.opencode/` 状态在此 clone 中被排除，不属于持续维护的定制差异。
- 现有 Git stash 保持不变，不作为任一永久分支的证据。
- 分支保护可以防止破坏性的远端重写；它不能替代本地干净工作树检查、聚焦测试或对完整 `master...HEAD` 差异的评审。

-----

<a id="further-exploration"></a>
## 进一步探索

- [改进开发标准](improvement-development-standard.zh.md)——强制设计顺序与解决方案类型选择。
- [上游安全的定制方式](upstream-safe-customization.zh.md)——克隆配置、同步与恢复。
- [Fork v2 实现报告](fork-v2-implementation-report.zh.md)——已交付产品扩展及其验证证据。

<a id="dev-note"></a>
## 开发说明

无。
