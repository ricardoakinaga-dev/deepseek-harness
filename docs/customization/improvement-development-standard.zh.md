# 改进开发标准

[English](improvement-development-standard.md) | 中文

## 概述

每项定制改进都必须保持官方仓库的事实来源地位，在实现前选择解决方案类型，并且保持可归属、可测试、可移除以及可兼容后续上游更新。本标准对从 `custom/main` 工作的 agent 和维护者具有强制性。它用于决定变更应采用配置、profile patch、插件、组合包、skill、库、完整能力 seam、聚焦的上游包变更，还是仓库自动化。

## 目录

- [强制设计顺序](#mandatory-design-sequence)
- [解决方案类型选择](#solution-type-selection)
- [改进记录](#improvement-record)
- [架构与兼容性规则](#architecture-and-compatibility-rules)
- [按解决方案类型验证](#verification-by-solution-type)
- [评审与提交要求](#review-and-commit-requirements)
- [当前示例](#current-examples)
- [没有安全扩展时](#when-no-safe-extension-exists)
- [进一步探索](#further-exploration)
- [开发说明](#dev-note)

-----

<a id="mandatory-design-sequence"></a>
## 强制设计顺序

Agent 在编辑生产代码前必须完成第 1 至第 6 步。提案可以使用 `status: "proposed"`；只有实现和所需证据准备好提交时，状态才变为 `active`。

1. 说明用户可见结果、当前故障、非目标、移除后的行为，以及受影响的用户或 profile。
2. 阅读[架构](../architecture.zh.md)、所属包 README、生成的事件／服务参考和相关 Agent Note。识别已经拥有该行为的官方能力。
3. 搜索现有公共事件、服务、registry、配置字段、profile 层或包导出。记录改进复用的机制，以及有意不重复实现的官方行为。
4. 从下表中只选择一个 `solutionType`。不得仅仅因为插件可以避免编辑现有文件就选择插件；所选类型必须与行为和生命周期所有者匹配。
5. 在实现扩散到仓库其他位置前，在[定制策略](../../.agents/customization-policy.json)中添加或更新改进条目，包括预期路径。
6. 定义兼容性义务和证据：模型可见日志记录、已发布 Session 可读性、配置验证、生命周期与 dispose、公共消费方、快照、包检查，以及上游更新后的移除方式。
7. 在基于 `custom/main` 的主题分支上实现最小而完整的行为。当需要持久决策依据时，更新所属 README、生成产物、测试，以及一个现有 Agent Note 或新建 Agent Note。
8. 运行策略验证器和每个受影响路径所要求的检查。把记录改为 `active`，评审相对于 `master` 的完整差异，然后提交并推送到 fork。

-----

<a id="solution-type-selection"></a>
## 解决方案类型选择

选择能够完整拥有所需行为的第一行。如果更简单的官方机制已经满足结果，不得用后面的类型替代它。

| `solutionType` | 策略 `kind` | 选择条件 | 不适用范围 |
|---|---|---|---|
| `configuration` | `extension` | 现有已验证字段已经能够产生该行为 | 新运行时逻辑或隐藏默认值 |
| `profile-patch` | `extension` | 现有插件只需要不同的有序组合或配置行 | 交付新的行为代码 |
| `plugin` | `extension` | 一个公共 Cordis 事件、服务或 registry 可以拥有可移除的运行时行为 | 替换私有状态或已注册所有者 |
| `bundle` | `extension` | 一个可安装层只组合现有插件和配置 | 在组合包入口模块中实现行为 |
| `plugin-and-bundle` | `extension` | 新插件需要一个可选的可安装 profile 层 | 复制官方 preset 或强制启用该行为 |
| `skill` | `extension` | 结果是 agent 指导、可复用工作流或配套资源 | 运行时强制、持久状态或应用行为 |
| `library` | `extension` | 多个包需要不带插件生命周期的可复用同进程 API | 服务、提供方、工具、profile 或可执行文件 |
| `capability-seam` | `extension` | 可替换能力需要完整的 Service Definition、Service Provider 和 Consumer 角色 | 没有独立消费方或替换需求的单个实现 |
| `upstream-package-change` | `upstream-patch` | 没有公共扩展能够保持所需官方行为或持久事实 | 大范围 fork 专用重写、复制源代码或私有 monkey patch |
| `repository-automation` | `governance` | 检查器、工作流、生成器或 agent 规则治理此 fork | 产品运行时行为 |

Skill 改变 agent 执行工作的方式；插件改变运行中的 Harness 行为。组合包用于分发组合，不拥有运行时逻辑。只有三个角色都存在时，能力 seam 才完整，即使一个包包含多个角色也是如此。

-----

<a id="improvement-record"></a>
## 改进记录

设计简报在实现前回答以下问题：

- 哪个可观察问题和结果定义了此改进？
- 哪个官方包、服务、事件、registry、profile 或文档拥有相邻行为？
- 哪个 `solutionType` 适用，为什么选择表中更早的行无法满足结果？
- 实现使用哪些公共扩展点和包导出？
- 改进拥有哪些文件和包？
- 哪些模型可见输入或决策必须从 Session 日志重建？
- 哪些配置因部署而变化，验证在何处失败？
- 取消、超时、并发、dispose、重新加载和部分失败如何工作？
- 移除改进时，已存储数据、profile 和 Session 会发生什么？
- 哪些聚焦测试、快照、构建产物冒烟测试、文档检查或真实提供方检查能够展示结果？

把机器可读部分添加到 `.agents/customization-policy.json`。以下插件模板包含包根目录，因为它交付运行时包源代码：

```json
{
  "id": "improvement-id",
  "kind": "extension",
  "solutionType": "plugin",
  "status": "proposed",
  "summary": "One current-state sentence.",
  "optIn": true,
  "packageRoots": ["packages/<group>/<package>/"],
  "paths": [
    "packages/<group>/<package>/",
    "docs/<owning-guide>*",
    ".agents/notes/<lifecycle>/<class>/<date>-<topic>*"
  ]
}
```

`configuration`、`profile-patch` 和 `skill` 记录可以省略 `packageRoots`，因为它们不得添加生产包源代码。`upstream-package-change` 使用 `kind: "upstream-patch"` 和 `upstreamPlan`；`repository-automation` 使用 `kind: "governance"`。每个定制路径恰好属于一项改进。

-----

<a id="architecture-and-compatibility-rules"></a>
## 架构与兼容性规则

- **保持上游所有权。** 复用官方服务和事件。不得把官方包、preset、生成 catalog 或实现复制到定制包。
- **依赖公共入口。** 导入包导出，绝不导入其他包的 `src/*`、私有字段、构建残留或未发布内部文件。
- **保持循环可替换。** 新行为必须使用有文档记录的扩展点。必须修改 `agent-loop` 时，应分类为 `upstream-package-change` 并更新 `docs/architecture.md`。
- **记录模型可见事实。** 到达模型请求的任何输入或改变行为的决策，都必须能通过官方 Session 事件或已接受的上游事件扩展重建。
- **保持已发布数据。** 可移除扩展不得使现有 Session 日志无法读取。Session 结构变更必须采用相邻版本迁移，并更新两个 SDK 投影。
- **完整拥有生命周期。** 注册使用 `ctx.effect()` 或 `ctx.on()`。Dispose 必须等待完全停稳，waterfall listener 必须通过 `next()` 委托，异步工作必须具有显式取消和失败行为。
- **公开部署选择。** 已验证配置拥有每个因部署而变化的值。默认值由所属实现显式解析，错误配置在最早可确定的位置失败。
- **保持可移除。** 可选包不修改官方 profile 源文件，不静默替换已注册所有者，并记录移除后保留的状态或行为。
- **使用受支持的启动路径。** 应用只能通过具名 `dsh` profile 启动。改进不得添加包 bin、demo launcher 或 SDK 参数逃逸通道。
- **每项事实只有一个所有者。** 代码和 JSDoc 拥有 API，包 README 拥有包行为，生成 catalog 拥有清单，本标准拥有解决方案选择，Agent Note 拥有持久决策依据。

进行生命周期、并发、子进程或资源销毁工作前，应用[防御模式](../defensive-patterns.zh.md)。添加包或扩展机制前，使用[包指南](../cookbook/adding-a-package.zh.md)和[扩展 cookbook](../cookbook/extension-cookbook.zh.md)。

-----

<a id="verification-by-solution-type"></a>
## 按解决方案类型验证

每项改进都必须有一个会因其核心回归而失败的聚焦检查。应添加下列适用证据，不得用一个宽泛测试套件替代缺失的行为检查。

| 解决方案类型 | 最低直接证据 |
|---|---|
| 配置或 profile patch | 生产 schema 解析、解析后配置检查和所属 profile 测试 |
| 插件 | 聚焦行为测试，以及其生命周期要求的取消、dispose、重新加载和失败用例 |
| 组合包或插件与组合包 | 生产 patch schema 测试、依赖／默认值断言，以及打包或真实 Loader 路径冒烟测试 |
| Skill | Skill 元数据／调用验证，并检查每个引用的脚本、资源和文件 |
| 库 | 聚焦公共 API 测试、typecheck，并在同一变更中更新每个消费方 |
| 能力 seam | Service Definition 约定测试、至少一个提供方、一个消费方、生命周期覆盖和组装后 profile 证据 |
| 上游包变更 | 所属包测试、受影响消费方、提取或上游计划，以及行为可见时的产品／模型快照 |
| 仓库自动化 | 有效 fixture、无效 fixture、顶层执行路径，以及指出违规规则和修正方式的诊断信息 |

使用[测试政策](../testing.zh.md)选择快照、真实提供方检查、构建产物冒烟测试，以及包或仓库检查。定制策略检查通过只证明分类和路径所有权，不证明运行时正确性。

-----

<a id="review-and-commit-requirements"></a>
## 评审与提交要求

提交前，作者或 agent 验证以下所有内容：

- 差异基于 `custom/main`，并且 `master` 仍与已拉取的官方分支完全一致。
- 策略记录具有正确的 `kind`、`solutionType`、状态、必要的包根目录、路径所有权，以及必要的上游计划。
- 实现使用所选机制，且不包含第二个隐藏机制。
- 公共消费方、文档配对、生成输出、测试、快照和 Agent Note 已同步。
- `node scripts/verify-customization-policy.mjs --base master` 通过，然后执行通过 `dsh-pre-push-checks` 选择的检查。
- 完整的 `master...HEAD` 差异不包含 secret、生成的构建输出、无关用户状态、复制的官方源代码或无法解释的核心编辑。
- 提交消息说明行为或策略结果。永久分支只接收普通提交或上游 merge commit，绝不强制推送。

-----

<a id="current-examples"></a>
## 当前示例

| 改进 | 分类 | 原因 |
|---|---|---|
| 弹性压缩 | `extension` / `plugin-and-bundle` | 公共全局 `llm/stream` waterfall 拥有该策略，可选组合包在不替换官方压缩的情况下挂载它 |
| 持久 shell 诊断 | `upstream-patch` / `upstream-package-change` | 已注册的官方 Bash 和 PowerShell 工具拥有其模型可见结果措辞；第二个插件不得替换它们 |
| 定制策略 | `governance` / `repository-automation` | 仓库验证器和 GitHub 工作流治理分支差异，不改变产品运行时 |

-----

<a id="when-no-safe-extension-exists"></a>
## 没有安全扩展时

所需公共机制不存在时，不得强行把想法实现为插件或 skill。记录一个聚焦的 `upstream-package-change`，说明缺失的事件、服务、持久事实或包导出；同时更新其官方消费方和测试；此前置条件落地后，再把可选行为保留在独立扩展中。如果此前置条件无法保持 Session 可读性、生命周期所有权或受支持的应用启动方式，应停止实现并保留提案，不得交付私有绕过方案。

-----

<a id="further-exploration"></a>
## 进一步探索

- [上游安全的定制方式](upstream-safe-customization.zh.md)——分支拓扑、同步与恢复。
- [Fork 提取](fork-v2-extraction.zh.md)——对扩展就绪想法和依赖上游想法的具体分析。
- [架构](../architecture.zh.md)——官方服务、事件、能力 seam、profile 和扩展点。
- [扩展 cookbook](../cookbook/extension-cookbook.zh.md)——代码级插件模式与机制索引。

<a id="dev-note"></a>
## 开发说明

无。
