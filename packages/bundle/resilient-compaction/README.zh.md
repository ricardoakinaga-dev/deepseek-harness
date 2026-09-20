---
description: "可安装的 profile 层，用于约束本地模型压缩并在提供方分派前拒绝过大的 agent loop 请求。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-resilient-compaction

[English](README.md) | 中文

## 概述

这个可选组合包为任何基于 base 的 `dsh --profile` 表面添加有界压缩，而无需替换官方压缩后端或复制 agent preset。它把压缩输出限制为 4,096 token，选择推理强度 `off`，应用八分钟协作式截止时间，并启用基于日志容量的请求准入。任何随附 profile 都不会自动包含它。当本地或吞吐受限模型让自动压缩慢到足以阻塞会话时，请安装它。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

### 安装到 profile

使用 profile 插件命令安装或移除组合包：

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-resilient-compaction
dsh plugin --profile <name> remove @deepseek-ai/dsh-resilient-compaction
```

发布安装通过 profile 的包管理器解析此包及其策略依赖。发布前，源码 checkout 的 manifest 仍使用 workspace 协议，因此 `file:` 安装无效。完成聚焦构建后，通过 `--patch` 传入 [`cordis.patch.yml`](cordis.patch.yml) 来运行 checkout；打包安装验证必须让 profile 包管理器同时能取得两个尚未发布的 tarball。成功添加后，profile 协调会读取 `dsh.bundle.patch` 并激活该层；缺少 patch 声明时只会留下已安装的普通依赖并产生警告。

### 获得的行为

该层插入一个具有全局 `llm/stream` 交付的宿主插件。全局交付是必需的，因为 Web 会话会在 preset 领域内挂载官方 `compaction-basic` 引擎。策略应用 `compactionMaxTokens: 4096`、`compactionReasoningEffort: off`、`compactionTimeoutMs: 480000`、请求预检、256-token 安全余量和 1,024-token 回退输出预留。后续 profile 或 `--patch` 层可以替换此配置项的整个 `config` 以调优这些值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

此组合包是单个插入 patch。它不会禁用或替换 `compaction-basic`；其策略包装公共 LLM（大语言模型）waterfall（瀑布式事件），读取公共会话和 token-meter 服务，并独立于压缩提供方所在领域。这样，官方 profile 与 preset 文件仍可从 upstream 升级。不会发布 invariant 配套插件，因为此静态载体不拥有可变关系；插入的策略拥有其运行时检查。

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 插入并配置全局弹性策略 |
| [`src/index.ts`](src/index.ts) | 静态组合包的空运行时 API |
| [`tests/resilient-compaction.spec.ts`](tests/resilient-compaction.spec.ts) | manifest（元数据清单）、依赖、YAML 与默认值检查 |
| — | 无 invariant 配套插件；静态载体不拥有可变关系 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [压缩弹性策略](../../compaction/compaction-resilience-policy/README.zh.md)——精确行为与配置。
- [Fork 提取指南](../../../docs/customization/fork-v2-extraction.zh.md)——比较结果与扩展边界。
- [组合包映射](../README.zh.md)——profile 层组合。
- [Profile 插件组合包 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)——层解析与顺序。

-----

<a id="model-experience"></a>
## 模型体验

通过 `@deepseek-ai/dsh-compaction-resilience-policy` 间接生效；后者拥有有界辅助调用和分派前拒绝行为。

#### KV Cache 影响

组合包本身不添加请求前缀。插入的策略保留压缩消息字节，因此会保留后端可复用前缀，直到提供方自有的模型或推理选择位置。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定组合包的部署边界。

- **`off` 是适配器自有的强度 id**——不公布该值的模型会拒绝压缩；请用受支持的低成本 id 覆盖完整策略配置项，或省略 `compactionReasoningEffort`。
- **该层依赖 base 服务**——必须存在 `llm`、`sessions` 与 `tokenMeter`；缺少它们的极简自定义 profile 会让插件等待依赖。
- **后续配置 patch 会替换完整配置块**——调优一个字段时，请重述希望保留的每个值。
- **策略的事件日志限制仍然适用**——在依赖事件日志中的有效推理强度或降低后的输出上限之前，请查阅其 README。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
