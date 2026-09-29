# M0 仓库分析 — 2026-09-20（更新于 2026-09-21）

[English](repository-analysis-2026-09-20.md) | 中文

## 摘要

本文记录 DeepSeek Harness 分支最新的 M0 分析和聚焦后续证据。报告区分已复现的失败、环境前置条件、延后的发布通道和控制平面验证，避免通过命令成功状态掩盖未完成的标准项。AAA-021 现在明确了独立 hygiene 的构建前置条件，并使其 17 个叶子门禁汇总通过，但仓库目前仍不具备发布资格，因为最新的汇总 `check:all` 有 55 个门禁通过、6 个失败、6 个因依赖而跳过，安全审查、发布身份和平台通道也仍然开放。

Gauntlet v1.4 在材料证据和文档更新后已重新建立基线。其状态仍为 `ACTIVE`/`BUILD_RUN`，并要求在同一候选版本上执行新的发布门禁；重新建立基线只同步候选版本身份，不会使任何 Quality Bar 标准通过。

## 目录

- [范围与状态](#scope-and-status)
- [证据身份](#evidence-identity)
- [当前发现](#current-findings)
- [M0 基线后的更新](#updates-since-the-m0-baseline)
- [发布通道矩阵](#release-lane-matrix)
- [Quality Bar 对账](#quality-bar-reconciliation)
- [责任与下一步](#ownership-and-next-action)
- [可复现性](#reproducibility)
- [限制](#limitations)
- [进一步阅读](#further-exploration)
- [开发备注](#dev-note)

-----

## 范围与状态

<a id="scope-and-status"></a>

本次分析覆盖 `custom/main` 检出版本、M0 复现动作 `AAA-001:A02`、截至 `AAA-021:A01` 的已完成聚焦后续动作、已完成的 `AAA-018:A03` 规范指标和 README 一致性工作、当前针对 `AAA-012:A01`、`AAA-014:A01`、`AAA-015:A01`、`AAA-019:A01`、`AAA-020:A01` 和 `AAA-022:A01` 的只读决策包，以及针对 `AAA-023:A01` 和 `AAA-024:A01` 的发布准备包；当前控制平面指针是 `AAA-009:A02`，正在等待维护者决定客户端领域所有权和共享 API 放置。源代码基线是不可变标签 `aaa-m0-source-2026-09-20`；保存点标签 `aaa-savepoint-2026-09-20-m0-a02-01` 标识干净的控制平面起点，当前证据更新仍在工作树中。

当前结论是 **FAIL — 不具备发布资格**。结论使用当前命令记录和保留的原始输出摘要，不使用历史审计中的 86 或 65 分。

最新的 `pnpm run check:all` 已完成，但返回非零结果：55 个门禁通过、6 个失败、6 个在构建依赖失败后跳过。客户端领域图报告 38 个违规；构建报告两个缺失的临时 `oxlint-contract-...ts` 文件；模块图报告三个过期产物；仓库引用和具体术语门禁保留两个历史发现；测试门禁在 11 个文件中报告 20 个失败测试。汇总仍被阻塞，不能使发布候选版本获得资格。证据位于 [`AAA-023/check-all-a02.json`](../../.agent/evidence/AAA-023/check-all-a02.json)。

工程控制平面是一致的：`check_state.py` 报告 11 项通过和 0 项失败，但该检查只验证证据记录，不替代 14 项必需的 Quality Bar 标准。

AAA-013 已在其范围内完成：解析后的静态目标必须位于配置根目录内，目录外的符号链接或 junction 目标返回 403 且不返回外部字节，根目录内的别名仍然可用。实现与真实组合证据位于 [`AAA-013/findings-a02.json`](../../.agent/evidence/AAA-013/findings-a02.json) 和 [`commands-a02.jsonl`](../../.agent/evidence/AAA-013/commands-a02.jsonl)。

AAA-011 也已在其范围内完成。Bash 和 PowerShell 提供方、成对 README、持久决策说明和聚焦超时断言现在对完整超时前缀与新 shell 重置消息保持一致。Bash SDK 快照通过；官方 PowerShell headless 快照由其 manifest 发现但因本 Linux 主机没有受支持的 `pwsh` 可执行文件而跳过。证据位于 [`AAA-011/findings-a02.json`](../../.agent/evidence/AAA-011/findings-a02.json) 和 [`commands-a02.jsonl`](../../.agent/evidence/AAA-011/commands-a02.jsonl)。

AAA-016 已完成其有限范围的治理验收。验证器现在拒绝 `configuration`、`profile-patch` 和 `skill` 记录中的 `packageRoots`，同时保留已打包扩展的有效根目录。聚焦策略套件通过 7/7，三种非打包类型的无效矩阵均报告可操作错误，顶层验证器在五个改进项中报告 171 个已归属的定制路径。证据位于 [`AAA-016/findings-a02.json`](../../.agent/evidence/AAA-016/findings-a02.json) 和 [`commands-a02.jsonl`](../../.agent/evidence/AAA-016/commands-a02.jsonl)。

AAA-017 已完成其范围内的治理验收。验证器现在验证配置的官方远程仓库，抓取其镜像分支，通过精确提交 ID 与 `origin/master` 比较，并在引用缺失或分歧时先于归属检查失败。聚焦套件通过 10/10，离线夹具覆盖匹配、不匹配和缺失引用，工作流等价命令证明相等；在该检查点五个改进项归属 179 个定制路径，加入 AAA-021 的责任路径后策略检查归属 196 个路径，加入当前八个证据包文件后当前检查归属 204 个路径。证据位于 [`AAA-017/findings-a02.json`](../../.agent/evidence/AAA-017/findings-a02.json) 和 [`commands-a02.jsonl`](../../.agent/evidence/AAA-017/commands-a02.jsonl)。

AAA-021 已完成其有限范围的仓库自动化验收。`verify-hygiene-prerequisites` 扫描 302 个工作区 package manifest；当所需 `lib/` 输出缺失时提前失败并给出可执行的构建提示，当输出存在时独立 `pnpm run hygiene` 的 17 个叶子门禁全部通过，`check:all` 仍保留显式的构建先于 hygiene 顺序。聚焦调度器和夹具测试通过 106/106，仓库 typecheck 和 lint 通过，定制策略现在在五个改进项中归属 196 个路径。证据位于 [`AAA-021/findings-a01.json`](../../.agent/evidence/AAA-021/findings-a01.json)、[`commands-a01.jsonl`](../../.agent/evidence/AAA-021/commands-a01.jsonl) 和 [`implementation-ready-AAA-021.json`](../../.agent/gates/implementation-ready-AAA-021.json)。

AAA-012:A01 现在有一个关于 WebSocket 关闭缺口的只读决策包。客户端 `RemoteStreamMuxClient.close()` 请求 socket 关闭，但没有证明 socket 已达到 `CLOSED`；确定性夹具可以保持在 `CLOSING`，而 gateway README 没有定义调用方可见的完成、超时、错误顺序、重复关闭或晚到回调契约。实现前维护者必须选择物理关闭还是逻辑处置。证据位于 [`AAA-012/scout-a01.json`](../../.agent/evidence/AAA-012/scout-a01.json)。

AAA-014:A01 现在有一个关于 HTTP bridge 资源准入的只读决策包。bridge 强制执行每请求 300 MiB 的缓冲体上限，但没有聚合预留、并发上限、队列或共享释放路径；专用 RPC bridge 调用也绕过配置的 connection 上限。实现前维护者必须决定路由范围、预算计算、准入行为、拒绝语义、静默释放和配置所有权。证据位于 [`AAA-014/scout-a01.json`](../../.agent/evidence/AAA-014/scout-a01.json)。

AAA-015:A01 现在有一个关于动态扩展信任和部署的只读决策包。Host-only 执行可以立即发生，浏览器评估使用 `new Function` 和动态加载，在检查的路径中没有找到仓库所有的 CSP 或 Trusted Types 策略，Plugin Manager 接受多种源形式并默认启用。实现前维护者必须批准支持的部署、同意绑定、CSP 立场、源信任和默认启用策略。证据位于 [`AAA-015/scout-a01.json`](../../.agent/evidence/AAA-015/scout-a01.json)。

AAA-019:A01 现在有一个关于 fork 包发布身份的只读决策包。清单发现 293 个 package manifest，全部使用 `@deepseek-ai/dsh-*` 命名空间、全部公开，并全部声明官方仓库 URL，而检出版本的 fork 远程仓库是 `ricardoakinaga-dev/deepseek-harness`；`pnpm run publint` 退出码为 0，但命名空间所有权、发布权限和迁移策略仍未决定。证据位于 [`AAA-019/scout-a01.json`](../../.agent/evidence/AAA-019/scout-a01.json)。

AAA-020:A01 现在有一个关于公开源导出兼容性的只读决策包。清单发现 293 个 package manifest 中有 279 个导出 `./src/*`，而受影响的 `files` 数组省略源文件；`pnpm run publint` 退出码为 0，但带有未匹配源文件警告。维护者必须决定删除该导出、发布并支持源树，或将其隔离到单独授权的开发发行包中。证据位于 [`AAA-020/scout-a01.json`](../../.agent/evidence/AAA-020/scout-a01.json)。

AAA-018:A03 已完成其范围内的验收。维护者确认 `README.md` 是规范社区频道来源；`README.zh.md` 现在包含相同的三个目标，`pnpm run verify-readme-community-parity` 通过，并以负向夹具覆盖缺少目标和仅本地化目标的情况。`pnpm run audit:metrics` 输出包含所需模式、版本标识、环境、语料摘要和五个命名计数的已验证 JSON。本报告记录了 4,436 个源文件，计数为 90 个 `deprecated_reader`、263 个 `lint_suppression`、53 个 `todo_marker`、1,625 个 `explicit_any` 和 7 个 `selected_skip`；当前检出版本不包含生成的 metrics JSON。这不会授权静态债务迁移或广泛规则/编译器改动。

AAA-022:A01 现在有一个关于静态契约债务的只读决策包。规范的 AAA-018 命令已经定义受 Git 跟踪的源代码语料和计数语义；其当前值在上文保留，早期探索性清单仅作为历史证据。有效的 host 和 client TypeScript 程序分别列出 1,599/249 和 551/74 个文件/引用，选定所有者路径的 Oxlint 检查退出码为 0。尚未授权迁移波次或广泛规则/编译器改动。证据位于 [`AAA-022/scout-a01.json`](../../.agent/evidence/AAA-022/scout-a01.json)。

AAA-023:A01 和 AAA-024:A01 现在有发布准备包。14 项标准矩阵记录每个 Quality Bar 项缺失或过期的确切证据；当前工作树不是不可变候选版本，Gauntlet 重新基线后的既有范围通过记录已过期，最终审查员也不能运行。数据包保留了必需顺序：先解决决定、完成依赖、封存候选版本、收集本地和外部通道、演练上游更新，然后运行全新的最终审查员。证据位于 [`AAA-023/scout-a01.json`](../../.agent/evidence/AAA-023/scout-a01.json) 和 [`AAA-024/preflight-a01.json`](../../.agent/evidence/AAA-024/preflight-a01.json)。

当前发布门禁只提供支持性证据：`pnpm run verify-node-next-types` 对 302 个工作区声明 API 通过，`pnpm run publint` 对 293 个包退出码为 0，但仍保留已知的 `./src/*` 未匹配源文件警告。这些结果没有解决 AAA-019/020 策略，也没有使发布通道获得资格。

-----

## 证据身份

<a id="evidence-identity"></a>

规范矩阵是 [`AAA-001/findings.json`](../../.agent/evidence/AAA-001/findings.json)，并包含 [`commands.jsonl`](../../.agent/evidence/AAA-001/commands.jsonl)、环境清单以及被忽略的 `.artifacts/aaa-001/` 目录中的原始输出。

矩阵包含 41 条命令记录、43 个直接来源引用、覆盖 P1–P16 的 16 个发现、14 项 Quality Bar 标准记录和 23 条必需发布通道。自动验证没有发现孤立命令、缺失原始输出或摘要不匹配。

独立的只读覆盖审查同意 M0 必须保留 P1 数量差异以及 P3/P11 分类冲突。M0 现在使用当前生成文件清单记录 P15；早期审查关于 P15 未覆盖的观察已由追加的命令记录取代。

-----

## 当前发现

<a id="current-findings"></a>

以下表格保留 M0 基线失败。当命令分类指出测试夹具假绿或执行缺口时，命令退出码为 `PASS` 不会被视为标准通过；聚焦后续结果见下一节。

| 领域 | 当前观察 | 责任项 |
| --- | --- | --- |
| 工作区与依赖图 | constraints 找到八个没有 package.json 的包深度目录；刷新后的汇总仍因客户端领域图报告 38 个违规而失败；模块图输出已过期。 | AAA-002、AAA-009、AAA-010 |
| 测试与模型可见行为 | 最新汇总测试门禁在 11 个文件中失败 20 个测试，同时 26,165 个测试通过、181 个跳过、1 个预期失败；早期快照和预期输出基线仍单独保留。 | AAA-004、AAA-005、AAA-006、AAA-008、AAA-023 |
| 覆盖率与发布消费者 | 覆盖率在 11 个文件和 28 个测试中失败；端到端测试在 3 个文件和 14 个测试中失败；Web 在 105 个文件和 47 个测试中失败，并有 357 项跳过。 | AAA-004、AAA-005、AAA-007、AAA-021、AAA-023 |
| 浏览器与基准前置条件 | Web 和两个长会话基准测试缺少 Chromium；指定运行器尚未提供当前替代信号。 | AAA-007、AAA-023 |
| 运行时与安全契约 | 静态审查仍发现 WebSocket 过早关闭完成、HTTP 仅按请求缓冲且没有聚合上限，以及动态代码策略缺口；AAA-013 的静态目标逃逸已在重点包范围内解决。 | AAA-012、AAA-014、AAA-015；AAA-013 已完成 |
| 治理与发布身份 | 加权审批仍引用已删除路径；非打包记录的 packageRoots 校验默认拒绝；官方镜像相等性现已强制执行；自定义包仍声明官方命名空间和仓库，公开源导出策略也未决定。 | AAA-003、AAA-016、AAA-017、AAA-019、AAA-020 |
| 文档与指标 | 当前文档快速聚合有 19 项门禁通过，并保留两个历史失败；README 社区频道一致性通过，规范指标命令记录了 4,436 个文件的语料。持久 shell 文案缺口已在责任路径范围内关闭。 | AAA-018、AAA-022 |

历史 P1 残留数量作为范围冲突保留：葡萄牙语报告说有四个目录，而当前 constraints 和英文审计记录八个。P3 目录发现和 P11 生成名称发现也以当前分类保留，不会被静默删除。

-----

## M0 基线后的更新

<a id="updates-since-the-m0-baseline"></a>

M0 矩阵仍然是历史基线。以下后续证据限定在各自任务内，不会把 M0 的汇总失败追溯改写成发布通过。

AAA-002 删除了八个已核实的被忽略包深度残留目录；清理后的 `constraints` 检查通过。

AAA-003 将加权审批的生产归属修正为 `ptc-runtime-python`；通过 `uv` 执行的文档化 Python 测试为 12/12，Node approval-policy 门禁为 80/80。

AAA-004 发现的是测试夹具权限问题，而不是 spill 产品缺陷。聚焦套件在 umask `0002` 和 `0022` 下均为 41/41 通过，不安全目录的负向控制仍然通过。

AAA-005 和 AAA-006 保留原始 Session generation v0，提供当前 writer 的相邻 v3 generation，在 CI 代表性的 `lib` 模式下解析自定义适配器，并使聚焦语料通过 3/3。source 模式的 ToolRuntime 身份观察单独保留，没有被 `lib` 结果隐藏。

AAA-007 确认支持的 CI 作业已经在 Web 消费者之前安装包所有的 Playwright Chromium。本地在没有浏览器二进制文件时 `chromium.launch()` 仍失败，并输出标准的可执行安装命令；没有安装主机浏览器或操作系统包。

AAA-008:A01 的聚焦 pi-ai DeepSeek 兼容性用例连续五次通过。直接的组合 profile 捕获到两个预期请求：用户触发的 agent turn 和后台 Session 标题请求。历史上的第三个请求没有复现，因此没有依据进行产品改动；在 `AAA-008:A02` 中仍等待维护者批准或原始失败追踪。

AAA-009:A01 将全部 38 个客户端领域图违规分成五组，并为每组保留 38 个明确的文件/导入条目、责任方、依赖顺序和聚焦验收路径。由于建议的归属和共享文档 API 决定尚未实现，验证器仍然失败；没有修改产品源代码。证据保留在 [`AAA-009/findings.json`](../../.agent/evidence/AAA-009/findings.json) 和 [`commands.jsonl`](../../.agent/evidence/AAA-009/commands.jsonl) 中。`AAA-009:A02` 在 VERIFY 状态等待维护者的架构决定。

AAA-010:A01 重新运行了所属的模块图新鲜度检查。验证器报告 `docs/module-graph.md`、`docs/module-graph.zh.md` 和 `docs/module-graph.i18n.yaml` 已过期；写入模式的重新生成仍然排在 AAA-009 的归属和共享 API 决定之后。证据位于 [`AAA-010/verify-a01.json`](../../.agent/evidence/AAA-010/verify-a01.json)。

AAA-013:A01 重现了仅词法静态文件逃逸，并规定了解析后目标的规范化包含检查。AAA-013:A02 修改了 `packages/host/frontend-static/src/index.ts`，增加了真实组合下的根内与根外目标夹具，同步了成对 README 和已实施 Agent Note，并以语句、分支、函数和行均 100% 的覆盖率通过重点检查。`pnpm run test:gui` 也通过了 433 个文件、6,180 个测试和 1 个跳过测试；主机构建、仓库类型检查、策略、Note 格式、配对和差异检查均通过。当前证据保留 Linux-only 限制、Windows junction 分支未执行，以及可移植 resolve-to-read 竞争窗口。

AAA-011:A01 将责任范围扩展到两个持久 shell 实现、其测试、成对文档、持久决策说明以及 Bash/PowerShell 无密钥快照族。AAA-011:A02 同步了超时和重置文案，并强化两个提供方测试以断言完整的模型可见文本。聚焦 shell 组合通过 39/40，其中一个是预期的平台跳过；Bash SDK 回放通过 1/1，而 PowerShell headless 场景在此主机上由官方 manifest 明确跳过。包级类型检查、命名翻译配对、策略归属和差异检查均通过。原生 PowerShell 回放仍是 CI 负责的平台检查，本机不作不受支持的通过声明。

AAA-016:A01 重现了治理假绿，其有限范围的修正现已完成。`validateCustomizationPolicy` 拒绝 `configuration`、`profile-patch` 和 `skill` 记录中的 `packageRoots`，保留有效的已打包扩展根目录，并通过聚焦套件 7/7 及顶层验证器。已实施的双语说明和开发标准配对也通过；证据位于 [`AAA-016/findings-a02.json`](../../.agent/evidence/AAA-016/findings-a02.json) 和 [`commands-a02.jsonl`](../../.agent/evidence/AAA-016/commands-a02.jsonl)。

AAA-017:A01 重现了官方镜像工作流缺口，AAA-017:A02 完成了有限范围的修正。验证器现在从策略记录取得官方远程仓库，抓取配置分支，在归属检查前拒绝精确提交分歧，并提供可操作诊断。聚焦套件通过 10/10，匹配/不匹配/缺失夹具通过，针对公开远程仓库的工作流等价命令通过，三个命名文档/Note 配对一致，473 个 Agent Note 均通过格式检查，`git diff --check` 通过。当前策略检查在五个改进项中归属 196 个路径。GitHub Actions 分派和故意分歧的真实远程仍未执行，属于平台或复现限制。

AAA-021:A01 实现了独立 hygiene 前置检查。新的基于 manifest 的检查覆盖 302 个工作区 manifest，在构建输出缺失时于任何 hygiene 叶子门禁前失败，并返回可执行的 `pnpm run build` 提示。独立 hygiene 汇总通过 17/17；`check:all` 的构建依赖仍然显式存在，而不是隐藏在 hygiene 内部。聚焦调度器/夹具套件通过 106/106，typecheck 和 lint 通过，Note 格式与翻译配对通过，定制策略验证器报告五个改进项中归属 196 个路径。

AAA-022:A01 在不修改源代码或配置的前提下重现了静态契约债务和所有权缺口。只读包记录了语料不一致、探索性债务计数、所有者组、兼容性例外以及分开的规则/编译器探针；在 AAA-018 定义规范指标并由维护者批准第一波之前，保留历史值并推迟实现。

AAA-023:A01 和 AAA-024:A01 建立的是准备证据而不是发布证据。矩阵确认当前工作树无法为 14 项标准提供资格，因为它是脏的，重新基线后既有范围通过已过期，平台和凭据通道仍由外部负责，并且没有最终独立审查员或认证说明。

AAA-023:A01 已在当前工作树上通过 `pnpm run check:all` 重新执行。汇总完成了 55 个通过门禁、6 个失败门禁和 6 个跳过门禁。测试叶门禁在 11 个文件中失败 20 个测试，构建失败使六个依赖的发布叶门禁跳过；本次执行是当前不具备资格的证据，不是发布候选版本的结论。证据位于 [`AAA-023/check-all-a02.json`](../../.agent/evidence/AAA-023/check-all-a02.json)。

AAA-019:A01 在不修改 manifest 或联系 registry 的前提下重现了 fork 发布身份缺口。检查的 293 个 package manifest 全部使用上游 `@deepseek-ai/dsh-*` 命名空间和官方仓库元数据，尽管检出版本的可写远程仓库是 fork；决策包记录了有界的命名空间、可见性、权限和迁移方案。在 fork 维护者作出决定前，不授权发布或重命名。

AAA-020:A01 在不修改 export map 的前提下重现了公开源导出警告债务。293 个 manifest 中有 279 个暴露 `./src/*`，而受影响的 package files 列表省略源文件；当前 publint 在成功退出的同时发出未匹配源文件警告，决策包记录了删除、发布和单独开发发行包三种方案。在公开 API 策略获批前，不作兼容性声明。

AAA-018:A03 实现了规范审计指标命令，保留了当前 JSON 结果，将 `README.zh.md` 与英文社区清单对齐，并增加了精确目标一致性门禁。聚焦测试通过 9/9；文档快速聚合通过 19/21，仅保留两个历史发现。翻译配对通过 1,027/1,027，新的 Agent Note 记录了语料和社区频道决定。

AAA-022 记录的当前探索性盘点报告了 87 个 `no-deprecated` 匹配、211 行 `oxlint-disable`、57 行 `TODO/FIXME/XXX` 以及 866 行 `any` 标记。这些数值仅用于诊断：该数据包使用明确的非规范语料和标记语义，因此不能建立趋势，也不能证明 Quality Bar 通过。

报告更新期间的文档检查 `pnpm run test:docs` 完成了 21 个门禁中的 19 个。翻译配对检查了 1,027 对并通过，README 一致性门禁通过；剩余两个失败是不可变的历史记录：`.agent/execution-log.jsonl:1` 的 `commit-hash`，以及 `docs/customization/repository-audit-2026-09-20.md:140` 的历史禁用措辞。

-----

## 发布通道矩阵

<a id="release-lane-matrix"></a>

当仓库策略、凭据、平台所有权或候选版本顺序阻止执行时，M0 将通道记录为 `NOT_RUN`。`NOT_RUN` 是证据缺口，不是通过。

| 通道 | M0 结果 | 证据 |
| --- | --- | --- |
| 构建和发布系列顺序 | PASS | `CMD-AAA-001-006`、`CMD-AAA-001-030` |
| constraints、依赖图、单元测试、快照、预期输出 | FAIL | `CMD-AAA-001-001` 至 `CMD-AAA-001-008` |
| 覆盖率、端到端、Web 和浏览器基准测试 | FAIL | `CMD-AAA-001-027`、`026`、`028`、`031` |
| 文档和卫生检查 | FAIL | `CMD-AAA-001-025`、`029` |
| typecheck 和 lint | NOT_RUN | `CMD-AAA-001-039`、`040` |
| 汇总 check:all | FAIL — 55 个门禁通过、6 个失败、6 个跳过；客户端领域图报告 38 个违规，测试门禁在 11 个文件中失败 20 个测试 | [`AAA-023/check-all-a02.json`](../../.agent/evidence/AAA-023/check-all-a02.json) |
| Windows、支持的 Node 版本和带凭据的提供方测试 | NOT_RUN | `CMD-AAA-001-033` 至 `035` |
| 打包安装资格 | NOT_RUN | `CMD-AAA-001-036` |
| 官方镜像抓取和合并演练 | NOT_RUN | `CMD-AAA-001-037` |
| 新鲜独立最终审查 | NOT_RUN | `CMD-AAA-001-041` |

矩阵不声明最终发布候选版本。`AAA-QB-01` 至 `AAA-QB-14` 的失败和延后通道仍然是阻塞项，直到当前证据替代它们。

### 聚焦后续结果

当前任务证据补充了以下范围受限的结果：

- `AAA-002`：清理后的 constraints 通过；`AAA-003`：审批归属和聚焦策略测试通过。
- `AAA-004`：spill 套件在 umask `0002` 和 `0022` 下通过，包括不安全目录控制。
- `AAA-005`/`AAA-006`：v0 保持不变，v3 为当前代，定制 `lib` 回放通过 1/1，语料通过 3/3。
- `AAA-007`：CI 浏览器归属已经存在；本地缺少浏览器是预期的前置条件失败。
- `AAA-008:A01`：聚焦预期输出测试通过 1/1 并且重复五次；直接捕获观察到两个预期请求。
- `AAA-009:A01`：38 个客户端领域违规已经完整盘点和分组；刷新后的汇总和直接门禁重现仍以退出码 1 结束，因此在记录共享 API 和归属决定之前不授权实现。
- `AAA-023:A01`：最新汇总执行成功完成 55 个门禁，失败 6 个门禁，跳过 6 个依赖门禁；测试叶门禁在 11 个文件中失败 20 个测试，因此候选版本仍不具备资格。
- `AAA-013:A02`：解析后静态目标包含检查已实现并验证；重点源代码覆盖率为 100%，主机/客户端 GUI 套件通过 6,180 个测试。
- `AAA-011:A02`：持久 shell 超时与重置文案已同步；聚焦测试 39/40 通过并有一个预期平台跳过，Bash SDK 回放通过，本主机上的 PowerShell 回放明确由 CI 负责。
- `AAA-016:A02`：三种非打包解决方案类型均拒绝 packageRoots，有效的已打包根目录仍被接受，聚焦和顶层策略检查通过。
- `AAA-017:A02`：归属检查前已强制执行官方镜像抓取和精确相等检查；聚焦与工作流等价检查通过，GitHub Actions 分派仍由平台负责。
- `AAA-021:A01`：基于 manifest 的 hygiene 前置检查覆盖 302 个包，独立 hygiene 通过 17/17，聚焦调度器/夹具测试通过 106/106，typecheck 和 lint 通过，`check:all` 仍保留构建先于 hygiene 的顺序。
- `AAA-018:A03`：维护者确认的英文 README 社区频道策略已经实现；中文 README 具有精确目标一致性，指标产物已保留，聚焦套件通过 9/9，文档快速聚合通过 19/21 且仅保留两个历史发现。

这些结果不会替代失败的汇总矩阵、尚未执行的带凭据或平台通道，也不会替代待处理的人工决定。

-----

## Quality Bar 对账

<a id="quality-bar-reconciliation"></a>

冻结的标准仍是 `AAA-QB-v1.4`。其规范来源哈希、标准和修订日志现在与 `.gauntlet/bar.json` 完全一致；Gauntlet 在本次对账后重新建立基线，并将此前的指纹历史保留为过期证据。

M0 不需要 `AAA-QB-v1.5` 修订。规范的 AAA-018 命令在 4,436 个受 Git 跟踪源文件的语料上报告 90 行 `no-deprecated`、263 行 `oxlint-disable`、53 行 TODO/FIXME/XXX、1,625 行包含 `any` 的代码和 7 行选定的 `.skip(`。

历史值仍然保留：对应观察依次为 85、205、81、66 和 8。新结果记录了语料排除项、版本标识、环境和计数语义，但不会修订冻结标准；追加 v1.5 修订仍需要证明 v1.4 无效的证据。

-----

## 责任与下一步

<a id="ownership-and-next-action"></a>

AAA-001 至 AAA-007、AAA-011、AAA-013、AAA-016、AAA-017、AAA-018 和 AAA-021 已记录当前范围内的完成证据，但完整汇总资格审查仍然开放。`AAA-008` 仍保持 VERIFY 状态，因为它的两个请求 oracle 仍需维护者批准或提供原始失败追踪。`AAA-009` 仍在 VERIFY，等待共享文档 API 和领域所有者决定。`AAA-012:A01`、`AAA-014:A01`、`AAA-015:A01`、`AAA-019:A01`、`AAA-020:A01` 和 `AAA-022:A01` 已有当前决策包，但仍为 TODO/DECIDE，分别等待对应的人工策略决定或静态债务迁移决定。`AAA-023:A01` 和 `AAA-024:A01` 已有准备包，但在封存候选版本前仍为 TODO。

产品改动仍需要单独的 customization-policy 记录，并在需要时取得人工决定。未解决的决定包括 AAA-008 请求 oracle、WebSocket 关闭语义、HTTP 聚合内存策略、动态扩展部署策略、包发布身份、公开源导出兼容性、静态债务迁移顺序以及广泛的 lint 或编译器改动。其余决策包和两个发布准备包只是准备证据；它们不授权无关实现，也不降低 Quality Bar。

backlog 仍是唯一的任务状态权威；本文总结当前指针，但不创建第二个队列。

-----

## 可复现性

<a id="reproducibility"></a>

使用 `python3 /home/ricardo/.agents/skills/engineering-framework/scripts/check_state.py /home/ricardo/deepseek-harness` 复现控制平面一致性检查。

使用 `pnpm run check:all` 和聚焦门禁 `pnpm run verify-client-domain-graph` 重现当前汇总阻塞；在 AAA-009 的归属和共享 API 决定实现前，聚焦门禁应继续报告 38 个违规。

使用 `pnpm run audit:metrics -- --output .artifacts/aaa-018/aaa-018-a03-2026-09-21/metrics.json` 重现保留的规范指标结果，并使用 `pnpm run verify-readme-community-parity` 验证英文规范 README 社区频道清单。

使用 `python3 /home/ricardo/.codex/skills/gauntlet-loop/scripts/gauntlet_state.py validate --repo /home/ricardo/deepseek-harness` 验证冻结的 Gauntlet 副本。

使用 `pnpm exec vitest run scripts/run-gates.spec.ts scripts/verify-hygiene-prerequisites.spec.ts`、`pnpm run verify-hygiene-prerequisites`、`pnpm run hygiene`、`pnpm run typecheck`、`pnpm run lint` 和 `node scripts/verify-customization-policy.mjs --base origin/master --require-official-mirror` 重现 AAA-021 的前置条件结果。

重新运行 `findings.json` 中描述的矩阵验证，并在解释结果前比较每个原始输出的 SHA-256。修复完成后，完整发布矩阵必须在一个封存候选版本上运行；M0 有意不替代该资格审查。

-----

## 限制

<a id="limitations"></a>

刷新后的分析没有执行 Windows/Wine、支持的 Node 矩阵、带凭据的提供方测试、打包安装资格或网络新鲜的上游合并演练。分析执行了汇总 `check:all`；运行器以非零结果完成，因为客户端领域图门禁报告了 38 个违规。AAA-021 仍然只验证独立 hygiene 汇总，并保留汇总调度器的构建顺序。

静态审查没有证明 `AAA-QB-05` 中剩余的安全契约；确定性的生命周期、聚合内存、CSP、同意和默认策略负向测试仍然必需。AAA-013 的重点符号链接逃逸约定现在已有实现和组合证据，但可移植应用检查不声称能抵御并发文件系统攻击者的内核级保证，本主机也未执行 Windows junction 分支。

后续动作没有使用真实的 `DEEPSEEK_API_KEY`，也没有下载 Chromium。最新汇总套件已经运行，并在上文记录的六个门禁中失败，其中包括 11 个文件的 20 个测试失败；六个因依赖而跳过的发布叶门禁仍未执行。历史上的第三个请求观察没有原始请求追踪，仍然等待维护者处理。客户端领域图在 AAA-009 的归属和共享 API 决定实现并重新测试之前仍然失败。最新的文档快速检查仍保留上述两个不可变历史失败。

本文记录特定时间点的仓库证据。这六个决策包和两个发布准备包由 I1 只读 scout 生成，并经过主代理源代码对照；它们不是独立的最终资格审查。本文不授权发布、不移除人工决定，也不声明 Triple-A 质量。

-----

## 进一步阅读

<a id="further-exploration"></a>

- [Triple-A 质量计划](aaa-quality-program.zh.md) — 路线图、责任和发布停止条件。
- [冻结的 Quality Bar](../../.agent/plans/deepseek-harness-aaa-quality-bar.json) — 精确的必需标准和证据方法。
- [定制开发标准](improvement-development-standard.zh.md) — 解决方案类型和责任规则。
- [上游安全定制](upstream-safe-customization.zh.md) — 分支、镜像和更新流程。

-----

## 开发备注

<a id="dev-note"></a>

本文是于 2026-09-21 更新的有日期 M0 摘要，包含已完成的 `check:all`、已完成 `AAA-021:A01` 的后续证据、已完成 `AAA-018:A03` 的规范指标和 README 一致性工作、`AAA-012:A01`/`AAA-014:A01`/`AAA-015:A01`/`AAA-019:A01`/`AAA-020:A01`/`AAA-022:A01` 决策包以及 `AAA-023:A01`/`AAA-024:A01` 发布准备包。原始命令记录和规范控制平面文件仍然是执行状态的权威；本文不替代 backlog 或 verification ledger。
