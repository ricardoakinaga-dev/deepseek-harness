---
description: "在 Web 模型设置中为 OpenAI Codex 提供可选的 ChatGPT 账号登录。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-codex-login

[English](README.md) | 中文

## 概述

这个可选的 Web 组合包在 `openai-codex` 提供方卡片中增加**使用 ChatGPT 登录**。它使用 `dsh-llm-pi-ai` 注册的 OAuth 流程，并通过现有凭据服务保存授权记录。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

使用 `dsh plugin --profile web add @deepseek-ai/dsh-experimental-codex-login` 将组合包安装到 Web 配置，或在 Web 插件管理器中启用它。在**设置 → 模型**中添加 `openai-codex` 提供方，不填写 API 密钥并保存。点击**使用 ChatGPT 登录**，打开授权页面并完成登录。如果浏览器无法连接 DSH 所在机器上的回调服务，请在同一提供方卡片中粘贴授权代码或回调 URL。**退出登录**会删除本地保存的 OAuth 授权记录。

提供方配置中的 `apiKeyEnv` 引用优先于 OAuth 授权记录；要使用账号登录，请移除此引用。配置必须加载 `dsh-llm-pi-ai`、授权服务和可写凭据提供方。

-----

<a id="understand-the-implementation"></a>
## 了解实现

Host 为一次登录提供带类型的 Remote 流。授权 URL 和手动代码提示只发送给发起登录的浏览器；浏览器通过同一连接返回代码。OAuth 令牌始终留在 Host 凭据存储中。关闭连接会撤销当前尝试。Client 为 `llm-pi-ai` 注册 `settings.models.provider-card` 扩展，只在 `openai-codex` 卡片中显示。

此包不发布 invariant companion，因为插件不持有独立的持久状态；授权服务和凭据服务拥有它读取的全部状态。

-----

<a id="model-experience"></a>
## 模型体验

无；此包只配置现有提供方的凭据，不增加模型请求或 Session 事件。

#### KV 缓存影响

无直接影响；选中的模型及其请求内容保持不变。

## 已知限制与待办工作

<a id="known-limitations"></a>

- 回调监听器绑定在 DSH Host 的 1455 端口。另一台机器上的浏览器通常需要使用手动代码输入框。
- OAuth 尝试不会持久保存；页面重新加载后需重新开始。退出登录只删除本地授权记录，不会在 OpenAI 端撤销授权。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者详情 — 点击展开</summary>

Web 卡片使用现有的提供方卡片插槽和 pi-ai 授权流程；组合包没有增加新的授权协议。

</details>
