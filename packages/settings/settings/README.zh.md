---
description: "通过 Config 派生表单查看和编辑插件的即时配置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-settings

[English](README.md) | 中文

## 概述

编辑插件通过 `.volatile()` 声明的字段，并查看其实际值。表单以 profile 条目 id 标识插件、保留秘密值，并拒绝过期写入。更改通过当前 profile 的 Cordis patch 持久化。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

将此插件与 Loader 和 [config-editor](../../boot/config-editor/README.zh.md) 一起挂载。基础组合包提供此组合。

```yaml
- id: settings
  name: '@deepseek-ai/dsh-settings'
```

此插件没有配置字段。表单只展示活动且可唯一定位的 profile 条目中的 volatile 字段。普通配置仍通过 Cordis 配置文件编辑。

Settings 启动后、Loader 完成所有条目的加载时，早期版本留在 harness home 中的 `settings.yaml` 会被导入一次：每个 section 写入同名条目（`ui-developer-tools` → `ui-settings`、`ui-onboarding` → `ui-settings-general`、`shell` → 当前平台的 shell 执行器条目），文件在第一次写入前改名为 `settings.yaml.imported`，被当前组合拒绝的 section 会记录日志并只保留在改名后的文件中。

重置恢复 profile 覆盖层以下的值，包括 schema 默认值。Home patch 和命令行 overlay 优先级更高；表单写入若会被它们覆盖，则被拒绝。

每个表单报告 `autoGenerate`（默认开启），供按 schema 生成页面的客户端使用；目前没有已发布的客户端这样做。自带页面的插件在 `apply` 中于可选的 `ctx.inject(['settings'], ...)` 子级内以 effect 注册 `configure({ auto: false }, ctx.fiber)`：子级指明策略所属的插件 fiber，迟加载或被替换的 Settings 服务也会采用该策略，业务插件无需 Settings 即可运行。策略不移除配置读写。

存在 Session 和 Agent 服务时，Settings 为每个已发布智能体的会话（包括子会话与恢复的会话）及 Settings 激活时已存在的智能体记录 `runtime/audit`。等待完成的 `agent/created` 钩子在所有 Session 创建观察者收到基线后验证并追加；失败会拒绝智能体发布。没有已发布智能体的独立 Session 不生成执行审计记录。初始记录包含 profile、启动组合包名称与启动器身份。源码启动分别记录 Git 修订、工作树是否有改动，以及启动器模块的 SHA-256；编译产物启动只记录该模块的哈希。哈希均不代表所有依赖的字节。无法获取的身份信息为 `null`。

插件作者通过 `.extra('extra', { audit: true })` 将字段加入审计。结构投影读取活动 Loader 条目解析后的 Config，包括 schema 默认值及 volatile 引用；未标记字段与对象中的未知字段被排除。标记沿已声明的对象、字典和数组字段传播。审计子树包含 `secret` 或 `credential-ref` 角色或无限制 schema 时，在记录前拒绝。Config 之外的插件专有转换不在检查范围内。

Profile 成功重载或可选 HMR 服务成功替换模块后，只追加审计值发生变化的条目；`values: null` 表示移除。只修改未标记字段不产生审计事件。记录是普通的已声明 Session 事件，需要读取器识别 `runtime/audit`，并保留在导出的日志中。仅配置的组合无需 Session 或 Agent 服务即可运行。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[表单投影](src/schema.ts) 去除运行时引用和普通字段。[服务](src/index.ts) 提供带修订号的描述符，在委托持久化前按完整插件 Config 验证编辑。业务插件直接读取自己的 Config 引用。

秘密角色从实际值、继承值、profile 覆盖值和 schema 默认值中隐藏；客户端接收存在性标记。路径编辑保留客户端未收到的字段。此服务投影 Loader 配置，不维护独立的权威值，因此不发布 invariant companion。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [设置参考](../../../docs/subsystems/settings.zh.md)——表单值与修改。
- [Volatile 配置](../../../vendor/loader/README.md)——引用生命周期与通知。
- [配置编辑器](../../boot/config-editor/README.zh.md)——持久化与重载顺序。

<a id="model-experience"></a>
## 模型体验

通过面向模型的插件读取的配置值间接影响模型。

#### KV Cache 影响

改变请求前缀的消费者决定缓存影响。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 嵌套 Include 独立拥有配置，不能通过当前 profile 的表单编辑。
- 字段重置恢复继承值，不能删除下层配置提供的值。取消设置数组索引会移除该元素。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
