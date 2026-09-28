# 审计证据读取限制

[English](README.md) | 中文

这个可选补丁限制基于 `dsh-base`、并挂载共享 `tool-fs` 配置项的 profile（例如 `headless`）中 `read` 工具的输出。

```sh
pnpm dsh --profile headless --patch configs/audit-evidence/cordis.patch.yml "Audit the requested files"
```

补丁将每次调用的 `readLimit` 从默认的 2,000 行降至 200 行，将 `readMaxBytes` 从默认的 51,200 字节降至 16,384 字节。如果还有未读取的行，读取结果末尾会给出下一个从 1 开始的 `offset`；再次调用 `read` 时传入这个偏移量，并将 `limit` 设为不超过 200。补丁保留 `readMaxLineLength` 的默认值 2,000 字符，因此单个长行仍会按现有规则截断。溢出（spill）策略不会缩短 `read` 结果，也无法恢复被工具限制截掉的内容。

`--patch` 在 profile 和主目录配置之后应用，并替换 `tool-fs` 配置项的整个 `config`。如果该配置项还有其他本地设置，使用前应将其写入这个覆盖文件。不传 `--patch` 时，profile 使用原有读取限制。Web agent preset 挂载独立的 `tool-fs` 配置项，因此这个覆盖文件不会改变它们的读取限制。

这个补丁降低单次大文件读取的最大输出。实际节省的 token 和字节数取决于所读文件、后续读取次数及模型行为；要证明会话用量降低 25%，必须在可比的审计任务上使用同一模型进行比较。
