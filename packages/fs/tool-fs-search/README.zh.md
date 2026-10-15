---
description: "面向模型的 glob 与 grep 发现工具：供组合或排查 agent（智能体）工作区搜索的用户与维护者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs-search

[English](README.md) | 中文

## 概述

使用 `dsh-tool-fs-search` 为模型提供本地工作区中的 `glob` 文件发现与 `grep` 内容搜索。搜索无需在宿主上安装 `rg`，也无需文件系统提供方；结果相对于工作目录，并排除 VCS 元数据。Glob 默认遵守忽略规则与隐藏文件过滤；显式包含可查找这些文件。可配置上限约束内联输出；挂载可选 spill 存储后，达到上限的结果仍可完整恢复。若需读取、写入或编辑文件，请选择同级 `dsh-tool-fs` 包。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

搜索使用 Session 的当前工作目录，包括通过 `working_directory` 切换后的目录。

在 `ctx.subprocess` 后端之后挂载工具；无需宿主 `rg` 安装，也无需文件系统提供方。模型随后获得优先列出未忽略路径的文件发现与按行组织的内容搜索，两者都有界并受超时防护。

### 最小组合

一个子进程后端，然后是工具；spill 后端为可选，使达到上限的结果可完整恢复。

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
- name: '@deepseek-ai/dsh-spill-local'
```

`sampleOverCapGlobResults` 是必填项且没有回退值：部署必须显式选择超过上限时的排序约定。格式化 spill 成功时，两种模式都会在 spill 产物中保留完整排序列表。

### 工具

| 工具 | 参数 | 行为 |
|---|---|---|
| `glob` | `pattern`、`path?`、`include_ignored?`、`exclude?` | 查找路径匹配 glob 模式的文件，默认遵守忽略规则与隐藏文件过滤，显式包含可解除这些过滤，但始终排除 VCS 元数据；不含 `/` 的模式匹配任意深度的基名，因此 `*` 匹配整棵树；常规结果保持按修改时间排序；显式包含时标记被忽略路径，并将其排在未被忽略路径之后 |
| `grep` | `pattern`、`path?`、`include?` | 用 ripgrep 正则搜索文件内容，并按文件分组返回 `Line N: <preview>` 匹配；`include` 是一个正向 glob 过滤器，逗号分隔列表与否定值会被前置拒绝 |

`include_ignored: true` 包含隐藏与忽略文件；默认值为 `false`。`exclude` 接受至多 32 个正向 ripgrep glob，总计至多 8192 个 UTF-8 字节，不能包含 NUL 或以 `!` 开头。排除规则在两种模式下都生效，且优先于匹配模式。调用方选择生成目录排除规则，例如 `**/node_modules/**`、`**/.next/**` 或 `**/venv/**`；工具没有内置生成目录列表。`.gitignore` 规则在 Git 仓库之外也生效。忽略文件规则与调用方排除规则保留完整结果 spill 与内联采样行为。

常规预算不进入面向模型的 schema：需要周边上下文的模型用 `read` 读取匹配文件，需要后续结果的模型遵循返回的 spill locator 检索提示。

### 配置

`sampleOverCapGlobResults` 为必填；其余键是可选的搜索上限，默认值如下。

| 键 | 默认值 | 含义 |
|---|---|---|
| `sampleOverCapGlobResults` | 无（必填） | `true` 在顶层条目之间对超过上限的 `glob` 页面采样；`false` 保留排序后的前部，未忽略路径优先 |
| `globMaxResults` | `100` | 一次 `glob` 调用内联展示的最大路径数 |
| `grepMaxMatches` | `250` | 一次 `grep` 调用内联保留的最大平铺匹配数；后续匹配写入格式化 spill 产物 |
| `grepMaxLineBytes` | `2000` | 每条匹配行预览的字节上限，保留 UTF-8 边界 |
| `rawOutputMaxBytes` | `20000000` | 常规 glob 的两份列表共享原始 stdout 总字节上限；显式包含时，发现列表与分类保留结果分别受此上限约束；溢出以 `SEARCH_RAW_OUTPUT_OVERFLOW` 失败 |
| `timeoutMs` | `30000` | 附加到两个工具的协作式工具调用预算，通过 `exec.signal` 强制执行 |
| `graceMs` | `3000` | subprocess seam 在 `timeoutMs` 之外授予的终止升级宽限期 |
| `stderrMaxBytes` | `65536` | `rg` stderr 的诊断尾部预算 |
| `searchMetaMaxBytes` | `65536` | 一次搜索序列化 `presentationMeta` 的字节上限；超出部分丢弃尾部的组/路径 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-fs-search)是每个受支持字段及其 JSDoc 的穷尽式真源。

### 部署要求

Node 部署在受支持的 macOS、Linux 与 Windows 目标上获得 `@vscode/ripgrep` 平台包；Python SDK 的 wheel 包把目标原生二进制复制到单文件运行时旁，作为 `-rg` 伴随文件。两种载体均不要求宿主安装 `rg`。返回路径相对于解析后的工作目录显示（有会话 cwd 时使用会话 cwd），只有该工作目录与文件系统根目录是同一工作区时，才能用 `read` 继续读取。

### 失败与恢复

搜索失败携带本包定义的错误码：`SEARCH_INVALID_PATTERN`（ripgrep 拒绝正则或 glob）、`SEARCH_FAILED`（启动失败、目标不可访问、信号终止或 `--json` 输出格式错误）、`SEARCH_RAW_OUTPUT_OVERFLOW`（原始输出超过上限）与 `SEARCH_ABORTED`（协作式超时或调用方取消）。退出 0 表示成功且有结果，退出 1 表示成功的空搜索；模型参数错误仍是普通工具参数错误。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释搜索工具背后的设计决策，并指出实现它们的代码位置；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

本地工作区发现天然是由进程支持的 `rg` 工作流；如果把搜索放到 `ctx.fs` 上，就会迫使每个文件系统后端扩展搜索 API。subprocess seam 负责 spawn 执行、进程树终止、环境清理与有界输出捕获；本包负责 schema、参数校验、argv 构造、解析、保留、格式化结果 spill 与超时声明。工具绝不暴露后台任务——只有在 `rg` 退出、被协作式超时终止、被中止或失败后，调用才会返回。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config`、工具组合、上限校验 |
| [`src/glob.ts`](src/glob.ts) | `glob` schema、argv、解析、内联采样、格式化 |
| [`src/grep.ts`](src/grep.ts) | `grep` schema、argv、`--json` 解析、预览保留、格式化 |
| [`src/search-core.ts`](src/search-core.ts) | 共享 spawn 助手、`SEARCH_*` 错误、spill 交接、工作目录相对展示 |
| [`src/presentation.ts`](src/presentation.ts) | 搜索卡片元数据投影 |
| [`src/direct-call.ts`](src/direct-call.ts) | spill 后处理的直接调用结果接受 |

### 搜索如何运行

每次调用解析打包二进制（`@vscode/ripgrep`，或 pkg 单文件运行时中可执行程序的 `-rg` 伴随文件），前置 `--no-config`，使宿主的 `RIPGREP_CONFIG_PATH` 无法向不受约束的 spawn 注入 `--pre` 预处理器，并把每个模型控制的值作为普通 argv 元素传入——不存在 shell 层，因此不涉及 shell 引号处理。collect 模式预算限制完整发现结果 stdout 与 stderr 尾部；lossy 发现结果读取以 `SEARCH_RAW_OUTPUT_OVERFLOW` 失败，而不是解析静默不完整的流。忽略分类读取未排序的 stdout 管道，仅保留已发现的候选路径，并以最长候选路径为待处理行的上限。更长的无关行会被丢弃直到换行。流读取失败时终止并等待子进程退出。工具从不读取原始 spill 路径。

常规 glob 将模式过滤列表与第二份不带正向 glob 的列表取交集，因为 ripgrep 的正向 glob 会覆盖忽略规则与隐藏文件过滤。两个前台进程在返回前都完全结束，并共享调用信号；stdout 总量受 `rawOutputMaxBytes` 约束，第二份列表仅获得剩余字节预算。如果第一份列表耗尽预算，辅助列表不会启动，调用会明确失败。显式包含忽略文件时还会进行流式分类，仅保留已发现的候选路径；发现列表与分类保留结果分别受此上限约束。两份列表在不同时刻观测工作区，因此并发文件变更可能使路径缺失；发现结果不是原子文件系统快照。

### 两类预算、两类产物

原始 stdout 与 stderr 是内部传输细节；工具始终把完整结果收集到内存中，只有内联页面设有上限。当调用产生超过内联上限的逻辑结果时，尽力而为的 spill 会把完整格式化预览保存到 spill 存储，页面携带其 locator；完整值不会进入模型上下文的分派则跳过 spill。spill 缺失或失败时保留内联页面，并报告完整结果无法保存——绝不会成为错误。收集与 spill 交接位于 `src/search-core.ts` 与 `src/presentation.ts`。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从工具逐步进入 subprocess seam、spill 存储与文件系统家族。

- [文件系统子系统](../../../docs/subsystems/filesystem.zh.md)——穷尽式提供方约定、策略事件与错误分类体系。
- [tool-fs](../tool-fs/README.zh.md)——用于后续读取的同级 `read`/`write`/`edit` 工具。
- [子进程能力](../../../docs/subsystems/subprocess.zh.md)——这些工具执行所经由的 spawn seam。
- [Spill 存储](../../spill/spill/README.zh.md)——使达到上限结果可完整恢复的可选后端。
- [超时工具](../../util/timeout/README.zh.md)——终止宽限期的 `MAX_TIMER_DELAY_MS` 上限。
- [生成工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs-search)——本包注册的穷尽式 schema。

-----

<a id="model-experience"></a>
## 模型体验

### 系统提示词

#### 模型看到的内容

组装时，每个段落通过 `ctx.tools.get(name, scope)` 检查对应工具，仅在其可见时输出。grep 段落仅在 read 可见时包含后续使用 read 的句子。同一受支持工具集合下，原文和段落顺序保持不变，包括通过 `run_code` 暴露的 PTC 能力。 这种按 scope 选择文本的机制适用于系统提示词段落。工具 schema 描述仍是注册时的文本，不提及其他工具。

##### Glob 指导

```markdown
Use the glob tool — not shell find — to discover files by path pattern.
```

##### Grep 指导

```markdown
Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.
```

#### Token 影响

指导成本取决于可见工具；必填的采样选择决定采用哪一个 glob 变体。

#### KV Cache 影响

可见工具集合、插件作用域、采样选择与指导文本不变时前缀稳定。限制、激活、dispose（资源释放）或改变选择可能从首个变化的段落开始使复用失效。

### 工具 schema

#### 模型看到的内容

glob 描述声明了配置的超过上限排序方式。生成的 [`glob` 和 `grep` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs-search) 使用 `sampleOverCapGlobResults: true`；工具无条件注册。

#### Token 影响

工具可见时每个请求有固定的 schema 成本。

#### KV Cache 影响

工具可见性与定义不变时前缀稳定。注册生命周期或作用域限制可能从第一个改变的 schema token 起使复用失效。

### 结果与 spill 提示

#### 模型看到的内容

`glob` 默认遵守忽略规则和隐藏文件过滤。使用 `include_ignored: true` 时，`glob` 每行返回一个路径，并用 `[ignored by ignore rules]` 标记被忽略路径；`grep` 在每个路径下分组展示 `Line <line>: <preview>` 匹配。Glob 分类流式读取第二次 ripgrep 列举，遵循 `.gitignore`、`.ignore` 及其他 ripgrep 忽略来源；它不声明文件是否受 Git 跟踪。未忽略路径优先，各组内部按修改时间排序。空搜索返回 `No files found` 或 `No matches found`。达到上限的结果给出省略计数及完整列表的 spill locator，或说明列表无法保存。采样先在未忽略组的顶层条目中取路径，再用忽略路径填充剩余位置。spill 包含完整排序列表及其标记。两次扫描共享取消信号和工具超时。分类遍历搜索根目录但不保留无关路径，因此无关列表的大小不会耗尽发现结果的输出上限；大型遍历仍可能超时。

#### Token 影响

内联路径与匹配受 `globMaxResults`、`grepMaxMatches` 与 `grepMaxLineBytes` 约束；调用及其保留结果在压缩（compaction）前留在历史中。

#### KV Cache 影响

仅追加；新可见内容跟在可复用请求前缀之后，不会使既有 KV Cache 条目失效。

### 工具错误

#### 模型看到的内容

失败被规范化为 `Error: <message>`，并携带结构化 `SEARCH_INVALID_PATTERN`、`SEARCH_FAILED`、`SEARCH_RAW_OUTPUT_OVERFLOW` 或 `SEARCH_ABORTED` 元数据供调用方使用。

#### Token 影响

只有失败的调用会增加这些保留 token。

#### KV Cache 影响

仅追加；新可见内容跟在可复用请求前缀之后，不会使既有 KV Cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明搜索工具何时不合适，或何时需要特别的运维注意。它们是当前包约束，不是通用搜索对比或任务积压。

- **搜索与文件访问没有共享工作区证明**——只有当工作目录与文件系统根目录指向同一工作区时，返回路径才可继续读取；本包不执行运行时跨服务校验。
- **打包二进制固定在依赖版本上**——Node 部署使用 `@vscode/ripgrep` 选择的版本；Python 单文件运行时将对应目标的原生版本复制为必需的 `-rg` 伴随文件。不支持的平台或损坏的安装会以 `SEARCH_FAILED` 使调用失败，Python 运行时包则会在启动前拒绝缺少伴随文件的安装。远程或虚拟文件系统需要共置的工作区或另一个搜索消费方。
- **schema 只暴露一个有界页面**——偏移分页、大小写开关、替代输出模式与提供方支撑的发现仍不在本包范围内；达到上限的完整输出需要 spill 后端。
- **启用采样时仅按搜索根正下方的第一段路径分组**——超过上限的 `glob` 页面在这些顶层条目之间平衡，因此集中在更深处的结果在该层级之下仍会呈现不均；递归平衡被延期。

- **常规 glob 限制两份列表**——即使模式只匹配少量文件，遵守忽略规则的候选列表也可能耗尽剩余原始输出预算。其溢出诊断会指出这个阶段：缩小 `path`、添加 `exclude` glob 或提高部署上限；缩小 `pattern` 无法减少这份列表。该预算限制原始 stdout 字节数，不限制解码字符串、集合与结果数组的总堆内存用量。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
