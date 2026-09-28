# Audit evidence read limits

English | [中文](README.zh.md)

This optional patch bounds the `read` tool's output in a profile based on `dsh-base` that mounts the shared `tool-fs` row, such as `headless`.

```sh
pnpm dsh --profile headless --patch configs/audit-evidence/cordis.patch.yml "Audit the requested files"
```

The patch sets `readLimit` to 200 lines and `readMaxBytes` to 16,384 bytes per call, down from the tool's defaults of 2,000 lines and 51,200 bytes. When more lines remain, the read footer gives the next 1-based `offset`; call `read` again with that offset and a `limit` of up to 200 to retrieve them. The patch leaves `readMaxLineLength` at its 2,000-character default, so the existing truncation of an individual long line still applies. The spill policy does not reduce `read` results and cannot recover content removed by these tool caps.

`--patch` applies after profile and home configuration and replaces the `tool-fs` row's entire `config`. If that row has other local settings, include them in this overlay before use. Omit `--patch` to use the profile's configured limits. Web agent presets mount separate `tool-fs` rows, so this overlay does not change their read limits.

This patch lowers the maximum output of a large single read. Actual token and byte savings depend on the files read, the number of follow-up reads, and the model's behavior; a 25% session reduction requires a same-model comparison on comparable audit tasks.
