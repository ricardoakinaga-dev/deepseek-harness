# 审计证据自动化

[English](README.md) | 中文

已登记的 [2026-09-28 语料清单](fixtures/2026-09-28-audit-corpus.json)只包含用户提供的 5 个子会话及其父会话的 Session v4 日志中的事件计数、工具调用配对、token 用量、时间、会话关联和 SHA-256 哈希。它不包含消息、提示词、工具参数及结果、文件路径或凭据。[源代码来源记录](fixtures/2026-09-28-source-revision.json)保存了父会话日志中观察到的 Git 基础提交，以及随后报告的 177 个变动路径。由于没有记录这些变动的哈希，历史审计实际使用的工作树修订版仍未知；文件哈希只标识日志的确切字节，不能确定源代码修订版。不要把这份语料与候选结果视为同一修订版来比较。

[R27-02 审查来源记录](fixtures/r27-02-review-session.json)包含已脱敏的独立上下文审查轨迹，以及所有者本地原始 Codex 会话的 SHA-256 哈希；原始会话记录不在仓库中，外部验证需由所有者提供该文件。

要从这 6 份日志的本地副本重新生成清单，对每个子会话使用一次 `pnpm exec tsx scripts/audit-evidence/session-corpus.ts manifest --revision unknown --child CHILD_PATH`，然后附加 `--parent PARENT_PATH --output MANIFEST_PATH`。该命令验证会话头及父子关联，向终端输出有界摘要，并将完整指标写入输出文件。`pnpm exec tsx scripts/audit-evidence/session-corpus.ts compare BASELINE_PATH CANDIDATE_PATH --output COMPARISON_PATH` 报告每个会话的差值，以及两个清单是否标识同一个已知修订版。

审计记录分别存为 JSON 文件。用 `reportSchema` 解析子会话报告；[report-output.schema.json](report-output.schema.json) 是一次性结构化子代理支持的 `outputSchema`，其结果仍须由 `reportSchema` 验证。在委派前声明每个发现所需的检查范围和 `independentReviewer`，然后运行 `pnpm exec tsx scripts/audit-evidence/reconcile.ts --requirements REQUIREMENTS_PATH --reports REPORT_PATH... --decisions DECISIONS_PATH --session AGENT_ID=SESSION_V4_JSONL_PATH --require-closed`，并为其他子代理重复 `--reports` 和 `--session`。退出码 0 表示记录有效且所有发现均已解决；无论是否传入 `--require-closed`，退出码 1 都表示记录有效但仍有未结或待处理的发现；退出码 2 表示输入格式错误、已解决发现或已执行测试缺少 Session 证据，或父代理给出了没有证据支持的决定。公开命令测试将[错误结案的父代理决定](fixtures/candidate-false-resolved-decisions.json)与录制的子代理报告一起运行，观察到 A24-03 和 A24-07 都以退出码 2 被拒绝。成功退出只证明已记录证据之间的一致性，不证明源代码或外部权威引用的真实性。

对每份子代理报告分别传入一次 `--session AGENT_ID=SESSION_V4_JSONL_PATH`，将每个已执行的 `test-run` 命令及所报退出码与已记录的 `bash` 工具调用和结果比较。任何已解决范围都须传入 `--session PARENT_AGENT_ID=SESSION_V4_JSONL_PATH`，以核对每个子会话头中的 `parentSession`；父代理对已执行测试作直接裁决时，决策记录还须包含 `sessionId` 和 `sessionSha256`。每份子代理报告须提供 `taskScope`、`files`、`sessionId` 和 `sessionSha256`；只读任务的 `files` 可为空。每个子会话头必须声明 `origin: subagent` 和 `parentSession`；传入父会话日志时，其 ID 必须与每个子会话声明的父 ID 相同。如果语料包含父 Session，每个子会话都必须关联到同一 ID。已执行测试的 `reference` 为 `session:SESSION_SHA256#TOOL_CALL_ID`，将其证据关联到一次已记录的调用。子会话未声明 subagent 来源或父会话关联、缺少或重复使用 Session、孤立的结果、未配对、中断或重复引用的 Bash 调用、轮次/步骤不匹配、shell 调用失败、命令不匹配或退出码不符时，对账以退出码 2 结束，已解决发现改为待处理，未解决发现保留。新的前台 Bash 结果提供结构化退出元数据；较旧的 Session 日志需要明确的退出文本标记，因此没有标记的零退出仍属未验证。结果包含每份 Session 的 ID 和 SHA-256，不包含工具输出。此检查不能确定源码修订版、独立认证代理与文件的对应关系，也不验证通过 `bash` 之外执行的命令。

运行 `pnpm exec tsx scripts/audit-evidence/quality-report.ts --corpus CORPUS_PATH --requirements REQUIREMENTS_PATH --report REPORT_PATH --decisions DECISIONS_PATH [--preflight PREFLIGHT_PATH] [--output QUALITY_PATH]`，并为每个子会话重复 `--report`，即可重新计算证据协调结果，并汇总会话、token、冲突、结案情况及可选的预检计数。退出码 0 表示已解决，退出码 1 表示记录有效但仍有未结、待处理或未验证的事项，退出码 2 表示输入或协调结果无效。每个子会话都须传入一次 `--session AGENT_ID=SESSION_V4_JSONL_PATH`；只要某个范围被判为已解决，或父代理裁决了已执行测试，也须传入父会话；父代理测试裁决还要求决策记录提供 `sessionId` 和 `sessionSha256`。完全未进行原始 Session 验证的结案声明为 `unverified`，退出码为 1，已验证解决数为零；开始验证但遗漏必需 Session 时，对账无效并以退出码 2 结束。`claimedResolved` 保留未验证的声明数量。只有源代码修订版一致，且每个必需的子会话与父会话 ID、SHA-256、角色及父会话 ID 均与语料清单相符时，原始日志验证通过的声明才会标为 `resolved`；未知或不匹配的修订版仍为 `unverified`，退出码为 1，已验证解决数为零。对固定候选输入执行两次公开的记录模式命令，所得输出逐字节相同，SHA-256 均为 `5eb2408ad48b279c8e671c956d79e501870ddabddb834886583f5ded1ec30264`；聚焦测试会重复该比较。该报告不会独立验证源代码观察结果或审查者的独立性。

[无密钥候选质量报告](fixtures/candidate-keyless-quality.json)根据回放中两个子代理生成的报告、父代理决定、[原始录制语料清单](fixtures/candidate-keyless-corpus.json)和[实际预检结果](fixtures/candidate-keyless-preflight.json)重新计算得出。其修订版与三个快照源文件的 SHA-256 摘要一致；回放断言会重新计算该摘要。报告记录了两个冲突、两个待处理发现、一个未执行测试而标为 `READY` 的预检，以及一个在依赖环境变量的真实 API 测试路径上因缺少 `EXA_API_KEY` 而标为 `BLOCKED` 的 Exa 搜索预检。[搜索声明](fixtures/candidate-keyless-search-preflight-spec.json)指定该测试命令，并对其源码及实际读取此变量的 Exa 提供方源码取哈希；若配置了字面密钥，则须使用另一份声明。不加 `--run`，分别对[测试声明](fixtures/candidate-keyless-test-preflight-spec.json)和搜索声明执行 `preflight.ts --spec`，并在后者执行前取消设置 `EXA_API_KEY`，即可重现结果。[录制关联记录](fixtures/candidate-keyless-recording-link.json)将每份原始会话哈希与其对应的不可变标准化录制副本的哈希、创建时间和确切写入内容哈希关联起来。[父会话录制副本](fixtures/candidate-keyless-recording/session.v4.jsonl)及同目录下的两个子会话副本独立于可刷新的[回放快照](../../snapshots/session/audit-evidence-reconciliation/snapshot.yml)保留这些关联；历史录制与回放的写入内容均与该场景的 `workspace.expected/` 核对。原始录制文件仍由所有者保留在本地，外部验证其哈希需要所有者提供这些文件。

## 文件系统预检与隔离候选

执行大范围检查前，使用 `preflight.ts --spec FILE --facts NEW_FILE`。独立事实文件记录实际进程的 UID/GID、命名空间句柄、声明的文件系统类型/UID/GID/权限，以及按需执行的 bubblewrap 功能探测。现有结果通过 SHA-256 引用该文件，因此证据消费方保留原有结果格式。事实和结果不包含环境变量值。无法获取的观察值保持 null 或 unknown；仅存在可执行文件并不能证明运行器可用。

`preflight-facts.json.runner` 描述能力探测所用的私有用户/PID/网络命名空间，不描述后续命令。执行监督进程另外使用私有 IPC/UTS 命名空间；`runner.json` 记录它实际的 UID/GID 及用户/挂载/PID 命名空间句柄。只有请求的可执行程序成功启动后，`started.json` 才重复这些监督进程事实并记录命令 PID。宿主或探测观察值从不替代已执行命令的事实。文件系统 stat 检查只确立类型、所有权和权限位，不证明挂载可写；子进程测试另行验证写入拒绝。

显式声明文件系统前提，并指定其适用于宿主还是运行器。`uid` 和 `gid` 为可选的非负整数，没有所有权默认值；`mode` 为四位八进制数字。运行器中的 UID 1000 不能满足声明的 UID 0 要求，宿主所有权也不能替代运行器观察值。以下示例检查目录权限，不施加全局所有者要求：

```json
{"cwd":"/path/to/source","command":["node","-e","process.exit(0)"],"runner":"bubblewrap","filesystem":[{"path":"/tmp","scope":"runner","kind":"directory","mode":"1777"}]}
```

能力不可用或前提不匹配时，在运行命令前返回 `BLOCKED`。不带 `--run` 的预检只返回 `READY`，不能确立产品结果。仅涉及宿主的检查仍可直接通过预检执行。命令成功生成后，若超时或捕获输出达到上限而中断观察，仍保留 `executed: true`；`TEST_TIMED_OUT` 和 `OUTPUT_LIMIT_EXCEEDED` 将这些阻塞结果与 exec 失败区分开来。声明运行器后，必须使用下述隔离工具执行，而不能探测另一命名空间后在宿主运行命令。命令以零退出并不能证明测试运行器执行了全部必需用例；应另行保留用例和跳过证据。

运行 `node scripts/audit-evidence/isolated-candidate.ts --spec FILE --artifacts EXISTING_DIRECTORY --run`，并将产物父目录放在原始候选之外。省略 `--run` 时，仅准备和检查副本，不执行声明的命令。这是仓库审计工具；启动 Harness 应用的命令仍必须使用受支持的 `dsh` profile。该工具要求支持 `--as-pid-1` 的 Linux bubblewrap、带有标准库 `ctypes`、`selectors` 和 `subprocess` 的 Python 3，以及可用的 Linux `prctl` 进程保护。`supervisor-prerequisite.json` 记录 Python 可执行路径与保护探测；缺少前提时返回 `BLOCKED`，不运行请求的命令。审计基础程序（`bwrap`、`python3` 与只读 Git 观察）仅从绝对 PATH 条目解析；规范化后的可执行文件必须位于 `/usr/bin`、`/usr/local/bin` 或 `/bin`，且可执行文件及其所有父目录必须由 root 所有，不可由组或其他用户写入。准备阶段不会运行相对 PATH 条目或候选控制的包装程序，包括省略 `--run` 时。没有可信的基础程序时阻止执行；没有可信 Git 时，Git 观察值保留为未知。工具不提供无约束执行的回退。

`candidate.json` 绑定 HEAD、Git 索引字节，以及每个文件系统条目的字节、权限位或字面链接目标。它包含已修改、未跟踪、被忽略的文件以及 Git 元数据。符号链接目标字节无需解码即可取哈希，并以 `targetBase64` 记录；复制时恢复原始字节，包括非 UTF-8 目标。无法通过 UTF-8 往返转换的条目名称会在返回候选身份前被拒绝。工具复制这些实际字节，在执行前再次核验副本和源目录，并仅允许命令写入其原子产物命名空间中的 `work/`、`home/`、`tmp/` 和 `output/`。`AUDIT_ARTIFACT_DIR` 指向 `output/`；产物根目录、控制器记录和日志在运行器内保持只读。运行器内的原始目录保持只读，包括绝对路径和符号链接目标；工具从不修改源目录权限或 Git 索引。外部写入方可能使候选失效，此时返回 `BLOCKED`，不尝试恢复原内容。运行后观察不可用时也会阻止结果；此时 `originalUnchanged: false` 表示无法验证原内容是否保持，并给出明确问题说明。

成功、失败和已处理的中断都会保留产物：可写目录、`candidate.json`、`preflight.json`、`preflight-facts.json`、`supervisor-prerequisite.json`、`runner.json`、命令成功 exec 后生成的 `started.json`、命令结束后生成的 `command-result.json`、`runner-result.json`、`stdout.log`、`stderr.log`、`runner-stderr.log`、`original-after.json` 和 `result.json`。即使监督进程已经启动，缺失 shebang 解释器仍使 `executed: false`。`exitCode` 和 `signal` 描述请求的命令；`runner-result.json` 单独记录运行器退出结果。命令被信号终止时标记为已中断并返回 `BLOCKED`；普通非零退出返回 `FAIL`。取消或超时会终止所属运行器，等待其关闭，并检查其 PID 命名空间已清空。即使进程以零退出，中断或未静止的运行也返回 `BLOCKED`。记录写入失败不会丢失已观察的 exec、退出码与信号事实；保存记录前会检查命名空间已清空。最终记录不可用时，在返回的阻塞结果中说明。

监督进程作为 PID 1 运行，并设置 `PR_SET_DUMPABLE=0` 和 `PR_SET_NO_NEW_PRIVS=1`；命令无法通过同 UID 的 `/proc/1/fd` 访问重新打开其控制描述符，也无法检查其内存。只有监督进程持有分帧控制管道；它向命令提供独立的输出管道，并关闭其他描述符。外部控制器校验消息并写入记录与保留原始字节的日志。控制器会完成日志的部分写入；若剩余字节无法写入，则将运行标记为 `BLOCKED`，并在 `runner-result.json` 中记录证据写入失败。命令输出中的类似控制消息的 JSON 仍作为日志数据处理。声明的环境变量值仅通过私有输入通道传给命令；Python 使用 `-I -S` 和独立环境运行。原始命令日志作为私有产物保留，可能含有显式声明凭据所产生的输出；结构化事实不会包含环境变量值。该边界约束子进程的文件系统写入，不约束独立宿主写入方或宿主服务。

## 任务交付清单

在声称多 ID 目标完成前，运行 `pnpm exec tsx scripts/audit-evidence/task-ledger.ts REQUIREMENTS.json LEDGER.json --require-complete`。经审查的要求文件包含 `schemaVersion: 1`、`objective`、`candidate`、`requiredIds` 和 `liveRequiredIds`；独立的交付清单包含相同的目标、候选版本指纹和必需 ID，以及每个 ID 对应的一行 `items`。每行记录 `state`（`PENDING`、`CODE_DONE`、`LOCAL_VERIFIED`、`LIVE_VERIFIED`、`BLOCKED_EXTERNAL` 或 `ACCEPTED`）、`liveRequired`、`limitation`，以及包含 `scope`、候选版本、命令、退出码、结果和引用的证据。只有全部必需 ID 都有绑定同一候选版本的本地证据及所需的实时证据并被接受时，命令才返回 0；有效但未完成的清单返回 1，格式错误或自相矛盾的记录返回 2。经审查的要求必须与代理编写的清单分开保存，避免缩小清单范围或改写候选版本来掩盖未完成工作。通过验证只表示记录内部一致，并不证明所引用命令的真实性或批准要求的权限。

## 受控读取限制测量

[本地读取基准结果](fixtures/local-read-benchmark.json)记录了通过随附 `headless` profile 进行的一次同模型比较。输入是[包含 1,000 行的合成文件](fixtures/read-benchmark.txt)，其中 BUG_A 位于第 20 行，BUG_B 位于第 130 行。两个会话使用同一模型路由、提示词、源文件哈希和参数相同的一次 `read` 调用。基线使用随附的读取限制；候选配置另外应用了[200 行补丁](../../configs/audit-evidence/cordis.patch.yml)。记录的输入 token 从 27,750 降至 15,420（44.4%）。两份最终回答都识别并引用了这两个错误。基线工具结果为 56,013 个字符，候选结果为 14,313 个字符。这一项合成任务不能预测其他任务或模型的节省幅度。

要重复测量，先构建 worktree，启动在 `127.0.0.1:8089/v1` 提供 `local-llm` 的本地模型，然后在 worktree 根目录创建指向该测试文件的 `audit-target.txt` 链接。将 `DSH_LOCAL_BENCH_KEY` 设为非机密的本地 token，并在每次运行时将 `DSH_AUDIT_BENCH_SESSION_ROOT` 设为新的输出目录。两次运行都使用下面完全相同的提示词及 `configs/audit-evidence/local-benchmark.patch.yml`；只有候选运行额外应用 `configs/audit-evidence/cordis.patch.yml`。两次运行必须保持同一本地路由和模型后端；用 `session-corpus.ts` 检查持久化的 Session v4 日志，以测量输入 token 并核对最终发现。

> Find BUG_A and BUG_B in audit-target.txt. Cite their row numbers and describe each failure in one sentence. Call the read tool with file_path audit-target.txt and offset 1, omitting the limit parameter. Do not use grep or shell. Read again only if BUG_A or BUG_B is not visible.

第二次[审计报告测量](fixtures/local-audit-read-benchmark.json)使用[合成报告段落](fixtures/audit-read-benchmark.txt)，其中包含 A24-03 和 A24-07 的冲突、未执行的测试，以及无法获取的安全通告和外部检查。在相同模型路由及源文件上，输入 token 从 20,979 降至 10,063（52.0%）；两份回答都引用了全部 6 个必要行号。这仍是一项限定范围的合成任务，并非对历史 5 个子会话审计的重新运行。将测试文件链接为 `audit-corpus.txt`，并在相同的两种 profile 条件下使用以下提示词：

> /no_think Audit only report rows 1-200 of audit-corpus.txt for A24-03 and A24-07. Cite each conflicting status and unavailable check by row. Call read with file_path audit-corpus.txt and offset 1, omitting limit. Do not use grep or shell. Ignore rows after 200.

### 具有代表性的五子会话 AUD-06 测量

[合成五子会话报告](fixtures/representative-five-child-audit.txt)分别包含 Web、基础设施、依赖、运行时和独立审查者的报告，直到第 260 行；后续为指标附录。A24-03 包含相互冲突的源代码状态和未执行的测试；A24-07 包含相互冲突的源代码状态、无法获取的安全通告、在第 200 行之后的补充报告中受阻的外部检查，以及未执行的运行时检查。合成父级记录将两个发现均标为待处理。[测量结果](fixtures/representative-five-child-audit-benchmark.json)记录了一对已完成的同模型运行：基线从第 1 行一次读到第 575 行；候选从偏移量 1 和 201 两次读取，直到第 382 行。两份回答都引用了全部 14 个必要行号，包括五个子会话的职责、后段外部检查和父级决定。提供者记录的非缓存 `inputTokens` 从 27,422 降至 16,104（41.3%），达到固定的 25% 目标。包含缓存读取的输入 token 上升 26.2%，`totalTokens` 从 41,695 升至 50,970（22.2%）；这组运行不能证明总体 token 或成本有所节省。

要重复这组运行，请按上文启动通过 `local-llm` 提供服务的本地 `qwen-gsq` 模型，为两次运行共用一个放在 `/tmp` 下的新 `DSH_HOME`，将 `DSH_LOCAL_BENCH_KEY` 设为非机密的本地 token，并为每次运行分别将 `DSH_AUDIT_BENCH_SESSION_ROOT` 设为不同的全新 `/tmp` 目录。在此 worktree 中，基线运行 `pnpm dsh --profile headless --patch configs/audit-evidence/local-benchmark.patch.yml "$PROMPT"`；候选在 `"$PROMPT"` 前增加 `--patch configs/audit-evidence/cordis.patch.yml`。两次运行都将 `PROMPT` 设为下面完全相同的文本，然后检查持久化 Session v4 的 `tool/call`、`tool/result`、`assistant/message` 用量及最终回答，再比较 token 和引文。

> /no_think This is a synthetic file extraction benchmark. Read scripts/audit-evidence/fixtures/representative-five-child-audit.txt from offset 1, omitting limit. The reports and addenda span rows 1-260; if a read stops before row 260, continue from the next unread row with read and omit limit. Return at most 250 words: five child names and remits; both A24-03 source statuses, its test status, and parent disposition; both A24-07 source statuses, its advisory, external, and runtime statuses, and parent disposition. Cite a row for every status and child remit. Do not call skill, shell, or any other tool. Do not infer executed checks.

此项测量针对报告读取，不代表实际委派五个子会话或对源代码作出裁定。由于工作树存在未提交变更，实际代码修订版未知；指标文件保存确切合成输入和原始 Session 文件的哈希，不包含会话文本。候选的额外模型调用使 `cacheReadTokens` 从 11,904 升至 33,508。这些独立的 headless 会话没有子会话关联，也没有符合格式要求的审计记录，因此没有生成 `session-corpus.ts` 子会话清单或记录模式质量报告。原始日志保留在 `/tmp` 下。

完成前两项运行后，删除根目录下的 `audit-target.txt` 或 `audit-corpus.txt` 链接。基准 JSON 文件只保留哈希、运行指标和引文行号；完整的会话日志保留在仓库之外。
