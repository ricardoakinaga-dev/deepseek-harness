# Agent Note: Keep custom work on an upstream-fed integration branch

Status: implemented

[English](2026-09-20-upstream-safe-customization-branch.md) | 中文

## 问题

Fork 需要一个稳定位置来保存本地产品改进，同时不能让官方默认分支形成混合历史。如果定制提交进入镜像分支，每次官方更新都必须先区分本地工作与上游工作，之后才能快进。如果 Agent 添加文件时没有记录所有者，看似隔离的扩展可能悄然开始编辑官方运行时包，并因此变得难以更新或移除。

## 决策

本地和远端 `master` 是 `deepseek-official/master` 的快进镜像。永久 `custom/main` 分支包含持续维护的定制差异，并通过普通 merge commit 接收 `master` 的更新。改进分支从 `custom/main` 创建并合回该分支；永久分支既不 rebase，也不强制推送。

[定制策略](../../../customization-policy.json)记录 remote、分支职责、合并策略，以及每项已提议、活动中或正在退役的改进。相对于 `master` 的每个变更路径恰好属于一项改进，其类别为选择性启用的 `extension`、具有退出计划的 `upstream-patch` 或仓库 `governance`。每项记录还声明兼容的 `solutionType`；含包的扩展列出自己的新包根目录，验证器会拒绝这些根目录以外的生产源代码变更。专用工作流会在定制分支推送以及以 `custom/main` 为目标的 pull request 上运行验证器。

[操作步骤](../../../../docs/customization/upstream-safe-customization.zh.md)负责克隆配置、更新命令和恢复方式。[改进开发标准](../../../../docs/customization/improvement-development-standard.zh.md)负责强制的编码前设计顺序、解决方案类型选择、兼容性规则、改进记录和证据要求。[Fork 提取提案](../../proposed/architecture/2026-09-03-fork-v2-extension-extraction.zh.md)继续负责把实验行为转化为独立插件和完整能力 seam 的架构标准。

## 考虑过的替代方案

**直接将定制工作提交到 `master`。** 拒绝此方案，因为 fork 会失去精确的官方镜像，而快进更新会变成产品历史与上游历史的协调工作。

**现在就把所有定制放进第二个仓库。** 拒绝此方案，因为当前扩展仍依赖工作区类型、生成的 catalog、快照和协同包。当一个包只使用已发布 API 并拥有自身发布生命周期后，仍可将其提取到其他仓库。

**每次官方更新后 rebase `custom/main`。** 拒绝此方案，因为重写共享永久分支会使已安装提交的标识失效，并且要求强制推送。主题分支仍可按照仓库的一般租约保护规则执行 rebase。

**只依赖文字规则，不维护路径清单。** 拒绝此方案，因为指导文字无法发现未登记的核心编辑。机器可读策略让每项定制差异中的所有权和扩展包隔离都可供评审。

## 后果

此 fork 保留精确的官方比较点，同时让定制版本拥有稳定的提交标识。上游更新仍可能在有意分类为 `upstream-patch` 的文件或共享生成文件中发生冲突，但每个冲突都有明确的改进所有者和提取路径。提议、引入、移动或退役改进或定制路径时，都必须投入设计和策略维护工作；这项成本能够防止解决方案类型漂移和隐性耦合累积。
