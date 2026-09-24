# Agent Note: 明确 standalone hygiene 的前置条件

Status: implemented

[English](2026-09-20-hygiene-prerequisite-preflight.md) | 中文

## Problem

standalone `hygiene` 聚合命令会使用编译后的 JavaScript 和声明文件，却没有检查完整构建是否已经生成这些文件。因此新 checkout 会并行启动多个叶检查，最后报告下游缺失文件，而不是给出所需的准备命令。

## Decision

`pnpm run hygiene` 先运行 `verify-hygiene-prerequisites`。该预检查扫描 vendor 与工作区 package manifest，检查 manifest 声明的 `lib/` JavaScript 和声明文件目标；当产物缺失时，它会在其余 hygiene 叶检查开始前失败。诊断包含缺失目标，并提示调用方运行 `pnpm run build`。

预检查只属于 standalone 聚合命令。`check:all` 保留构建产物消费者对 `build` 的现有调度依赖，因此聚合命令不会重复构建，执行顺序仍然明确。

## Alternatives considered

**让 standalone `hygiene` 自己负责 `build`。** 拒绝，因为这会把验证命令变成产生产物的命令，并重复 `check:all` 与 CI 产物 lane 已负责的构建。

**只记录现有前置条件。** 拒绝，因为仅有文档不能在聚合入口强制执行前置条件，下游诊断仍然不明确。

## Consequences

构建产物缺失时会产生一个提前且可执行的失败结果，不会启动并行的 hygiene 叶检查。完整 checkout 仍使用原有 worker 限制运行相同的 hygiene 检查。预检查只验证文件存在；产物有效性和 NodeNext 消费方兼容性仍由下游的发布与 NodeNext 检查负责。

## Testing

预检查通过夹具覆盖缺失和完整的 manifest 声明产物。门禁图测试固定 standalone hygiene 的每个叶检查都以该预检查为唯一前置项。
