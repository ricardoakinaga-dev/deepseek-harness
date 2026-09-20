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

选择能够保持行为且耦合最少的类别：

| 类别 | 使用条件 | 必需的维护记录 |
|---|---|---|
| `extension` | 公共 Cordis 事件、服务、profile patch 和包导出已经足够 | 选择性启用的包根目录；不修改官方生产源代码 |
| `upstream-patch` | 因没有公共扩展能够保持所需行为，必须修改官方源代码 | 聚焦的路径，以及指向提取或上游工作的 `upstreamPlan` |
| `governance` | 变更控制此 fork 的仓库工作流，而非产品运行时 | 仅限仓库路径；不含运行时包源代码 |

一个扩展通常包含一个行为包、相应测试与 README，以及用于挂载该包的小型可选组合包。它不得复制已发布 preset、修改 `agent-loop`、替换已经注册的服务或工具，也不得添加官方 Session 事件无法重建的模型可见状态。如果必须进行其中任一变更，先提出范围狭窄的官方 API 或持久事件变更，并让可选行为保持独立。

实现离开主题分支之前，在 `.agents/customization-policy.json` 中添加一个条目。以下缩略记录是可复用模板：

```json
{
  "id": "improvement-id",
  "kind": "extension",
  "status": "active",
  "summary": "One current-state sentence.",
  "optIn": true,
  "packageRoots": ["packages/<group>/<package>/"],
  "paths": [
    "packages/<group>/<package>/",
    "packages/bundle/<bundle>/",
    "docs/<owning-guide>*"
  ]
}
```

该记录对每个定制路径恰好拥有一次所有权。共享生成文件归导致其内容变化的改进所有。核心 patch 使用 `kind: "upstream-patch"`，并以 `upstreamPlan` 取代 `optIn` 和 `packageRoots`；其范围应足够小，以便独立提交到上游或独立退役。

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
