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

`runtimeAudit` 插件命名空间独立于 SettingsForms 和 ConfigEditor 观察执行。存在 Session 和 Agent 服务时，它会为每个已发布的 agent session 记录 `runtime/audit`，包括子 session、恢复的 session，以及观察器激活时已运行的 agent。等待完成的 `agent/created` 钩子在 Session 创建观察者收到基线后追加记录；审计失败会拒绝发布 agent。未发布 agent 的 Session 不会收到执行审计。初始记录包含 profile、启动 bundle、[启动器标识](../../../apps/cli/README.zh.md#runtime-identity)，以及所有活动 Loader 条目，包括嵌套 Include。未知信息保持 `null`，已有记录不会被重写。

当前 Loader 保留模块命名空间，但不保存对应已加载代的源字节或包清单。因此模块哈希和包标识保持 `null`；当前解析结果和磁盘内容无法识别 Node 缓存中的代码，包括 HMR 失败后恢复的代码。启动器哈希通过 `sha256Source` 表示磁盘观测；`build.inputsSource` 同样限定后续磁盘读取，而非编译器已消耗的输入标识。`versionSource` 标识观测到的包清单或嵌入式构建。缺少这些限定字段的历史记录保持不变。

插件所有者通过 `.extra('extra', { audit: true })` 将字段纳入审计。投影读取活动 Loader 条目已解析的 Config，包括 schema 默认值和 volatile 引用；未标记字段和未知字段均被排除。标记沿已声明的容器传播，联合类型仅选择通过验证的分支。包含 `secret` 或 `credential-ref` 角色（包括字典键 schema）或无约束 schema 的审计子树会在记录前失败。该配置投影不会检查 Config 之外的转换。

`providerRetryPolicies` 通过 LLM 服务记录每条已注册路由的有效策略，包括原生 DeepSeek 默认值和 pi-ai 策略。观察器仅复制重试模式、次数与错误码以及退避字段；凭据、请求头和适配器选项均被排除。该清单独立于 schema 选择的配置；即使 provider 拒绝注册变更，后者仍描述已声明的 Config 值。`null` 表示 LLM 服务不可用，空列表表示没有已注册路由。缺少此字段的历史记录保留未知策略标识。

profile patch、Include 刷新或可选 HMR 模块替换尝试结束，或 LLM 注册变化后，审计记录包含发生变化的配置条目；`values: null` 表示移除条目。结束通知在 Loader 工作完成后报告实际活动状态，包括另一条目激活或模块回滚失败前发生的其他条目变化或移除；解析失败若保留运行中的树，不会产生变化。profile 成功通知保持独立。插件清单变化或模块替换成功时会附加完整的活动清单，即使已加载字节标识仍然未知。已注册策略清单变化时会附加完整的 `providerRetryPolicies` 快照。若组合与有效策略不变且没有替换模块，仅修改未标记字段不会产生审计事件。这些已声明的 Session 事件保留在导出日志中，读取器必须识别 `runtime/audit`。仅配置的组合无需 Session 或 Agent 服务。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[表单投影](src/schema.ts) 去除运行时引用和普通字段。[服务](src/index.ts) 提供带修订号的描述符，在委托持久化前按完整插件 Config 验证编辑。业务插件直接读取自己的 Config 引用。

秘密角色从实际值、继承值、profile 覆盖值和 schema 默认值中隐藏；客户端接收存在性标记。路径编辑保留客户端未收到的字段。

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
