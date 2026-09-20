# 仓库审计报告 — 2026-09-20

[English](repository-audit-2026-09-20.md) | 中文

## 摘要

仓库仍可构建，并且文档、GUI、类型检查、代码检查、重点运行时测试和正式发布流程均有较强的通过结果，但当前检出版本未达到仓库质量标准，因为汇总门禁失败，且仍存在模型可见行为、依赖图、卫生检查和治理方面的未解决问题。

## 目录

- [范围与结论](#scope-and-decision)
- [评分表](#scorecard)
- [已执行的证据](#executed-evidence)
- [问题发现](#findings)
- [优势](#strengths)
- [建议顺序](#recommended-order)
- [限制](#limitations)

-----

## 范围与结论

<a id="scope-and-decision"></a>

本次审计覆盖 `custom/main` 检出版本，使用 2026-09-20 审计记录的修订版本，版本为 `0.1.6-alpha.2`，范围包括源代码完整性、文档、测试、快照、包依赖图、构建、发布验证、运行时行为、涉及安全的文件处理以及上游治理控制。

结论为**待修复后失败**：仓库已有大量可运行功能，但 `pnpm run check:all` 以 61 个通过门禁和 6 个失败门禁结束，因此当前汇总质量信号不能视为可直接发布。

-----

## 评分表

<a id="scorecard"></a>

以下评分使用 0–100 分制，依据本次审计中执行的检查和确认的问题得出。

| 领域 | 分数 | 评价 |
| --- | ---: | --- |
| 文档与当前状态准确性 | 55 | 结构门禁通过，但历史数量、Shell 超时文本和 README 语义对应关系需要更新。 |
| 双语结构与网站卫生 | 80 | 文档门禁和文档构建通过；审计的 customization 区域不属于网站投影范围。 |
| 构建、包与发布 | 78 | 类型检查、构建和正式发布流程通过；本地残留仍导致卫生检查和 worker 导入失败。 |
| 测试与证据 | 35 | 汇总门禁失败，快照存在过时或环境依赖问题，并且一个模型可见的 Shell 变更缺少对应的记录会话更新。 |
| 架构与维护 | 68 | 主要架构保持连贯，但客户端领域依赖图和模块图存在过时内容或违规。 |
| 运行时与安全 | 68 | 重点路径通过，但 WebSocket 关闭静默期、符号链接跟随和缓冲 HTTP 并发仍有条件性风险。 |
| 前端与性能 | 78 | GUI 和类型检查通过；构建产物包含较大的客户端分块，领域依赖图违规仍未解决。 |
| CI 与运维 | 55 | 正式发布工作流正确，但测试、依赖图和残留失败阻塞了汇总 CI 证据。 |
| 上游治理 | 72 | customization 策略和审批门禁通过，但仓库身份和上游镜像检查需要复核。 |
| **总分** | **65** | **实现基础较强，但尚未达到干净的质量结论。** |

-----

## 已执行的证据

<a id="executed-evidence"></a>

以下检查通过：`pnpm run test:docs`、`pnpm run docs:check`、`node scripts/verify-customization-policy.mjs`、策略规范、审批策略和问题管理门禁、`pnpm run test:gui`、`pnpm run typecheck`、`pnpm run build`、`pnpm run lint`、gateway/connection/frontend-static 重点测试、SQLite/file-upload/http-bridge/attachment/compaction/subprocess 重点测试，以及 `pnpm run release:verify --family dsh`。

正式发布流程也通过：先运行 `pnpm run build:official`，再运行 `pnpm run release:pack --family dsh --out /tmp/dsh-audit2-npm --concurrency 8`，为版本 `0.1.6-alpha.2` 生成了 295 个系列 tarball。

汇总命令 `pnpm run check:all` 在客户端领域依赖图、单元测试、快照、预期输出、约束和模块图六个门禁上失败。

单元测试部分报告了 1,508 个通过文件、13 个失败文件、13 个跳过文件、26,150 个通过测试、26 个失败测试、1 个预期失败和 181 个跳过测试。

在主机 `umask 0002` 下，spill 清理失败可以复现，因为测试创建的会话目录变为组可写并会被有意拒绝；隔离运行的 spill 测试在 `umask 0022` 下通过，因此这是仍需确定性测试或 fixture 策略的可移植性失败。

快照门禁报告了 generation-v0 与 generation-v3 不匹配、在 `lib` 模式下使用缺失 `resilience-snapshot` adapter 的 resilient-compaction 回放失败，以及因缺少 Playwright Chromium 可执行文件而阻塞的 web 回放。

预期输出门禁报告了一个 DeepSeek 兼容性用例：fixture 预期两次服务器请求，实际观察到三次。

客户端领域依赖图门禁报告了 38 个违规，包括 `ui-conversation`、`ui-sidebar-browser` 以及多个 `ui-sidebar-documentpreview` 模块中的同级导入。

模块图门禁报告以下文件过时：`docs/module-graph.md`、`docs/module-graph.zh.md` 和 `docs/module-graph.i18n.yaml`。

卫生约束门禁报告了 8 个被忽略且没有 manifest 的包目录，包括 code-runtime、E2B、experimental Python、workflow worker-thread 和 text-preview 残留。

-----

## 问题发现

<a id="findings"></a>

### 测试证据与模型可见行为

Shell 持久化 provider 在 `packages/shell/tool-bash-persistent/src/index.ts` 和 `packages/shell/tool-pwsh-persistent/src/index.ts` 中返回详细的超时文本，但包 README 和对应的 Agent Note 仍描述旧的 `[Command timed out or OOM]` 文本。

custom 增量修改了 Shell 行为和测试，却没有增加对应的无密钥记录会话快照，而仓库测试策略要求模型可见行为使用快照。

### 依赖图与生成残留卫生

38 个客户端领域违规和过时的模块图文件削弱了仓库声明的依赖证据，即使实现和文档构建通过。

这些被忽略的包目录没有受 Git 跟踪的源代码或 manifest，但会被卫生检查和 worker 导入门禁看到；在汇总门禁通过前，需要清理它们或建立明确且经过验证的残留策略。

### 运行时与安全敏感路径

WebSocket 客户端在 socket 仍可能处于 `CLOSING` 状态时就解析 `close()`，因此调用方可能在物理关闭事件发生前观察到释放完成；当前 fake WebSocket fixture 同步关闭，无法证明静默期。

前端静态服务器在读取文件前执行词法包含检查，但检查之后仍会跟随符号链接；如果攻击者或构建输入能够在服务目录中放置符号链接，就会产生条件性的逃逸风险。

HTTP bridge 每个请求最多缓冲 300 MiB，且没有总并发上限，在多个大型并发请求下会产生条件性的内存放大风险。

### 文档与治理

根目录英文 README 描述 GitHub Discussions、topic discussions 和 Discord，而中文 README 改为 WeChat、表单和二维码图片；结构配对门禁通过，但不会验证这些联系渠道的语义一致性。

历史 customization 实施报告记录 1,128 个双语对和 2,259 个 Markdown 文件，而当前文档检查报告 1,018 个双语对和 2,023 个原始 Markdown 文件；历史报告没有日期或提交标记来解释差异。

即使书面标准限制包源添加只能用于 packaged extension，customization-policy 脚本仍接受 `configuration` solution type 的 `packageRoots`；这是一个策略执行缺口。

customization 工作流与 `origin/master` 比较，而书面 fork 策略要求本地/fork master 与 `deepseek-official/master` 完全一致；本次审计时引用相同，但工作流没有强制检查这一更严格的关系。

新检查的两个包 manifest 将 `repository.url` 指向官方上游仓库，而不是 fork URL；发布前需要作出所有权决定。

-----

## 优势

<a id="strengths"></a>

文档快速检查、完整文档构建、GUI 测试、类型检查、代码检查、重点运行时测试、customization 策略和发布系列验证提供了较强的通过基线。

正式发布工作流会先通过 `build:official` 记录客户端构建，再进行打包；直接运行包命令时缺少所需的正式构建元数据，才会出现失败。

审计检查点的源代码 Git 工作树是干净的，且 `git diff --check` 通过；构建和打包命令只改变了被忽略的产物和临时发布输出。

-----

## 建议顺序

<a id="recommended-order"></a>

1. 通过解决 spill 目录可移植性、fixture 清理、缺失 adapter、Playwright 配置、预期请求数量和被忽略构建残留，使 `pnpm run check:all` 具备确定性。

2. 更新或重新生成客户端和模块图证据，并使领域依赖图违规符合声明的包所有权规则。

3. 对齐 Shell 超时文档，并为模型可见行为变更增加所需的无密钥记录会话快照。

4. 决定并记录 WebSocket 关闭静默期、符号链接策略、HTTP bridge 资源限制以及 fake WebSocket fixture 行为。

5. 修正或明确批准 README 渠道差异、历史数量来源、customization 策略执行、上游 master 检查和包 repository 元数据。

6. 重新运行重点门禁，然后运行 `pnpm run check:all`；在下一份带日期的审计中记录新提交、环境和精确命令结果。

-----

## 限制

<a id="limitations"></a>

本次审计没有修改产品源代码、测试或生成的文档，也没有执行被忽略构建残留的破坏性清理；因此关于残留的结论仍基于观察到的文件系统状态和门禁行为。

条件性安全问题依赖于部署或构建输入所具备的能力，而这些能力不一定存在于正常操作中；应根据威胁模型解决，不应直接视为已确认的利用。

### 开发备注

本报告记录 2026-09-20 的仓库状态和命令证据。修复后请创建新的带日期审计，不要修改这份历史记录。
