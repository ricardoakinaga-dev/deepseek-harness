---
description: "具有显式快照、订阅与生命周期所有权的浏览器可观察状态存储。"
kind: "package-library"
---
# @deepseek-ai/dsh-client-store

[English](README.md) | 中文

## 概述

使用本库可在不导入 React 的情况下，把浏览器侧状态发布为稳定快照。本库提供同步或 animation-frame 订阅、Immer 草稿更新、整体替换、浅比较、可选的 `localStorage` 持久化，以及供 Slot 注册使用的类型化 action handle。本库负责状态发布；`ui-renderer` 在 React 绑定位置创建 selector hook。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

需要可观察状态源的 Client 控制器、Slot 适配器或浏览器安全的功能代码可以直接导入本库。本库是依赖而不是 Cordis 插件，因此没有 profile 安装路径，也没有 `cordis.yml` 条目。

### 快照存储

`createSnapshotStore` 是直接入口。`getSnapshot()` 返回当前状态，`subscribe()` 返回取消订阅函数，`update()` 应用 Immer 草稿变更，`set()` 整体替换状态。

```ts
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

const store = createSnapshotStore({ draft: '' })
const unsubscribe = store.subscribe(() => {
  console.log(store.getSnapshot().draft)
})
store.update(state => { state.draft = 'ready' })
unsubscribe()
```

默认的 `sync` flush 会在同一次状态更新中通知订阅者。传入 `{ flush: 'raf' }` 可把更新合并到下一次 animation frame；没有 `requestAnimationFrame` 的环境使用一次 microtask flush。传入 `{ persist: { name } }` 可选择在浏览器 `localStorage` 中整体持久化 JSON。

### 声明式存储

`defineStore` 会把初始状态工厂、可选持久化 key 和完整的草稿 action 表转换成类型化 handle。框架为每个注册项和作用域创建 instance；组件收到的是 `useStore` 与绑定后的 action，而不是 `update`、`set` 或引擎 instance。

```ts
import { defineStore } from '@deepseek-ai/dsh-client-store'

const counter = defineStore({
  init: () => ({ count: 0 }),
  actions: {
    increment: draft => { draft.count += 1 },
  },
})
const instance = counter.create()
instance.actions.increment()
```

当多个注册项必须共享一个 identity 时使用共享 handle。当每个注册项需要独占 handle 时传入 factory。作用域持久化 key 会附加 Session key，因此每个 Session instance 使用独立的浏览器条目。

### 失败与生命周期行为

订阅回调从复制出的 listener 集合中运行。一个回调失败会被记录，但不会阻止后续回调。浏览器存储的读取、写入、解析、配额和隐私模式失败只会禁用受影响的持久化操作，不会拒绝状态更新。`clearPersisted()` 是显式清理操作，运行时作用域结束时不会自动调用。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

引擎使用 Zustand vanilla store 与 Immer 实现 framework-neutral 的 `ObservableSnapshot` contract。`raf` 模式只订阅一个内部 scheduler，再分发一次合并通知；`sync` 模式转发每次更新。`set()` 绕过 Immer，并在 production 之外深度冻结替换值，使整体替换与草稿更新拥有相同的开发期安全性。

`defineStore` 在 handle 上保留声明，并从 `init()` 创建新的引擎 instance。它从 root key 或可选的 Session scope key 得到持久化 key，然后把每个草稿 action 绑定到该 instance。Slot render machinery 负责创建 instance，并把每个裸 source 转换成 selector hook；本库不会创建 React hook。

### 源码索引

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 快照引擎、持久化、通知辅助函数与声明式存储实现 |
| [`src/contract.ts`](src/contract.ts) | framework-neutral observable、selector、store 与 action contract |
| [`tests/store.client.spec.ts`](tests/store.client.spec.ts) | 存储发布、批处理、持久化、action 与生命周期行为 |

本包不发布 `./invariant` companion，因为存储 instance 没有需要比较的进程全局所有权关系；其 observable 行为由本包测试覆盖。

</details>

<a id="further-exploration"></a>
## 进一步探索

当存储 contract 属于更大的 Client 组合时，请阅读以下页面。

- [ui-slots](../ui-slots/README.zh.md)——声明 Slot store handle，并推导组件的 store props。
- [ui-renderer](../ui-renderer/README.zh.md)——把裸快照 source 绑定为 React selector hook。
- [Web Client 架构](../../../docs/subsystems/web-client.zh.md)——划分 model、store 与呈现包之间的状态所有权。
- [Web Client Slots](../../../docs/subsystems/slots.zh.md)——定义 store 生命周期、作用域与组件输入规则。

<a id="model-experience"></a>
## 模型体验

无，因为本包提供浏览器侧状态基础原语，不注册任何面向模型的内容。

#### KV Cache 影响

无；这些存储既不组装也不发送模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **持久化仅限浏览器本地**——持久化值使用 `localStorage` 中的 JSON；非浏览器运行时会禁用持久化，本包也不提供跨设备同步。
- **持久化 key 必须在每个 live scope 中唯一**——两个独立创建且解析到同一 key 的 instance 会共享一个存储条目；框架管理的注册之外由调用方负责选择 key。
- **静态浏览器导入仍是构建输入**——本库保留供 Web shell 使用的第三方 ESM 导入；独立消费方按照 Client 依赖规则提供本包的开发依赖。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
