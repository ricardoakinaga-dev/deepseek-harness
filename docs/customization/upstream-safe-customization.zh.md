# 上游安全的定制方式

[English](upstream-safe-customization.md) | 中文

## 概述

此 fork 通过分离干净的镜像分支和定制产品分支，使官方仓库保持易于更新。`master` 镜像 `deepseek-official/master`；`custom/main` 包含完整且持续维护的定制差异；短期改进分支从 `custom/main` 创建并合回该分支。[定制策略](../../.agents/customization-policy.json)为每个定制路径指定一个所有者，策略检查会拒绝未登记文件，也会拒绝扩展修改其自有包之外的生产源代码。

## 目录

- [仓库拓扑](#repository-topology)
- [配置克隆](#configure-a-clone)
- [改进建模](#model-an-improvement)
- [从上游更新](#update-from-upstream)
- [验证与恢复](#verification-and-recovery)

<a id="repository-topology"></a>
## 仓库拓扑

| 引用 | 所有者 | 允许的内容 |
|---|---|---|
| `deepseek-official/master` | 官方仓库 | 外部事实来源；仅拉取 |
| `origin/master` 和本地 `master` | Fork 镜像 | 完全快进镜像；不含定制提交 |
| `origin/custom/main` 和本地 `custom/main` | 定制集成 | 已评审的改进以及来自 `master` 的合并 |
| `custom/<improvement-id>` | 单项改进 | 基于 `custom/main` 的临时主题分支 |

此 fork 继续使用单个仓库，因为定制包仍共享官方工作区、类型、测试和发布节奏。只有当一个包仅使用已发布 API、能够独立通过打包安装检查，并且无需编辑此工作区即可独立确定版本和发布时，才将其移至单独仓库。

<a id="configure-a-clone"></a>
## 配置克隆

在每个克隆中使用以下设置。官方 remote 无法接收误推送，`master` 跟踪官方分支，普通推送以 fork 为目标。

```sh
git remote set-url origin https://github.com/ricardoakinaga-dev/deepseek-harness.git
git remote add deepseek-official https://github.com/deepseek-ai/deepseek-harness.git
git remote set-url --push deepseek-official DISABLED
git config --local remote.pushDefault origin
git config --local branch.master.remote deepseek-official
git config --local branch.master.merge refs/heads/master
git config --local branch.master.rebase false
git config --local branch.custom/main.rebase false
```

如果 `deepseek-official` 已存在，请将 `git remote add` 替换为 `git remote set-url deepseek-official https://github.com/deepseek-ai/deepseek-harness.git`。Agent 只能从 `custom/main` 或基于它的主题分支进行产品修改。

<a id="model-an-improvement"></a>
## 改进建模

编辑生产代码前遵循[改进开发标准](improvement-development-standard.zh.md)。该标准负责强制设计顺序、解决方案类型选择、设计简报、兼容性规则、机器可读记录和验证证据。本指南只负责分支与更新操作。

策略 `kind` 描述维护方式：选择性启用的 `extension`、具有退出计划的聚焦 `upstream-patch`，或仓库 `governance`。必需的 `solutionType` 描述实现方式：配置、profile patch、插件、组合包、skill、库、完整能力 seam、上游包变更或仓库自动化。每个定制路径在 `.agents/customization-policy.json` 中恰好有一项记录。

<a id="update-from-upstream"></a>
## 从上游更新

从干净的 `custom/main` 开始。先快进镜像，将同一官方提交发布到 fork，然后把镜像合并进定制分支。不得 rebase 或强制推送永久定制分支。

```sh
git fetch --prune deepseek-official
git fetch --prune origin
git switch master
git merge --ff-only deepseek-official/master
git push origin master:master
git switch custom/main
git merge --no-ff master
node scripts/verify-customization-policy.mjs --base master
git push -u origin custom/main
```

在 `custom/main` 中解决合并冲突，不得通过编辑镜像来匹配定制代码。解决后重新生成由源代码负责的 catalog，运行受影响路径要求的检查，并且仅在官方行为和已登记改进都通过后提交合并。

<a id="verification-and-recovery"></a>
## 验证与恢复

每次定制推送前运行 `node scripts/verify-customization-policy.mjs --base master`。专用 GitHub 工作流会针对 `custom/**` 推送和以 `custom/main` 为目标的 pull request，与 `origin/master` 执行同一比较。仓库测试、文档检查、构建检查和快照仍按照受影响的产品路径执行；策略检查只验证归属与包隔离，不验证产品正确性。

上游合并前，通过提交当前主题或定制集成状态创建可恢复检查点。如果合并失败，请中止合并并返回该提交；不得重置镜像或丢弃未提交的用户工作。将发布 tag 保留在已验证的 `custom/main` 提交上，使已安装的定制构建能够独立于后续上游更新标识其精确来源。
