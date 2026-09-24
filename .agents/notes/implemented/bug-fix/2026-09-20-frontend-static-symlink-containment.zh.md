# Agent Note: 前端静态资源的解析目标包含

Status: implemented

[English](2026-09-20-frontend-static-symlink-containment.md) | 中文

## 问题

`@deepseek-ai/dsh-host-frontend-static` 先检查把请求路径名连接到配置的 distribution root 后得到的词法路径，然后读取该路径。因此，distribution 内的 symlink 或 Windows junction 可能在词法检查之后解析到根目录之外并暴露外部字节。

包 README 承诺提供的文件来自配置的 distribution root，但真实组合测试没有覆盖 symlink 的解析目标。

## 决策

`serveStatic` 保留词法遍历检查，并在分类或读取请求之前使用 `fs.realpath` 规范化 distribution root 与请求目标。它使用平台分隔符感知的包含谓词比较规范化后的路径，读取规范化后的根目录内目标，而不是链接形式的请求路径。缺失目标使用规范化后的最深既有祖先，并恢复缺失后缀。配置的 index 在读取 HTML 前也使用同一规则检查，包括请求目标是 distribution 目录本身的根路径请求。

真实 Loader 组合 fixture 覆盖根目录内的目录别名、根目录外的目录 symlink、Windows 目录 junction 等价物、外部缺失子项，以及指向 distribution 父目录的链接。外部目标返回 403 且不返回外部字节。现有的遍历、404、405、MIME、认证与 fallback 释放行为仍有覆盖。

此改动属于 `upstream-package-change`：frontend-static 拥有 fallback handler，没有公开的 plugin 或 webserver 事件可以在不复制官方所有者逻辑的情况下替代其文件系统目标判断。实现遵循仓库已有的[规范文件系统包含先例](../feature/2026-07-14-cross-family-fs-sandbox.zh.md)。

## 考虑过的替代方案

**只保留词法包含。** 不予采纳，因为直接复现会对 distribution 外部目录中的文件返回 200 和其字节。

**拒绝所有 symlink 或 junction。** 不予采纳，因为根目录内的别名是有效的 distribution 布局，而要求是解析目标必须包含在根目录内，不是按链接类型拒绝。

**使用平台特定的内核原语。** 暂缓，因为 `openat2` 和 Windows 句柄解析不能为该包支持的平台提供一个可移植实现。应用层检查适用于可信 Host 构建输入，但不是防御并发文件系统攻击者的内核级保证。

## 影响

每个静态请求都增加规范化文件系统路径的开销，并可能在构建目录变化时观察到中间状态。缺失或变化的目标会失败关闭，不会把无关的文件系统错误转换为成功。读取规范化后的目标缩小了可移植实现中的解析到读取竞态；需要内核级隔离的部署必须提供平台特定的服务原语，不能把本包当作那道边界。

## 测试

聚焦的真实组合测试通过，`src/index.ts` 的 statements、branches、functions 与 lines 均为 100%。包 README 及双语 sidecar 说明解析目标包含规则及其应用层威胁模型。customization policy 将此改动记录为 active upstream package patch。
