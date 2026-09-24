# 会话标题

[English](session-title.md) | 中文

[`@deepseek-ai/dsh-session-title`](../../packages/session/session-title) 所拥有的持久、后写覆盖的标题状态与可选异步提供方词汇。服务提供首消息投影输入，或使用固定历史上限调用提供方加载器；共享 LLM（大语言模型）辅助组件负责通过查询服务读取历史及精确的辅助请求记录。各包 README 负责时序、回退、失败与 fork 行为；生成的[持久化日志事件目录](../persistence-catalog.zh.md)负责完整的事件声明。

源码：[`packages/session/session-title/src/index.ts`](../../packages/session/session-title/src/index.ts)、[`packages/session/session-title-llm/src/index.ts`](../../packages/session/session-title-llm/src/index.ts)

## 持久标题状态

提供方生成修订时会记录 `SessionTitleProviderId`。`SessionTitleEventData` 列出生成标题时使用的精确人类消息 seq，`SessionTitleSnapshot` 则加入 `ctx.sessionTitle.get()` 与 `foldSessionTitle()` 返回的持久事件封装信息。`title` 投影的版本 2 状态会保存此快照，客户端视图则只提供标题字符串或 `null`。

```ts type-equiv
/** Identifies one session-title provider registration. */
type SessionTitleProviderId = Branded<'SessionTitleProviderId'>
```

```ts type-equiv
/** Exact auxiliary model route that produced a title. */
interface SessionTitleModelIdentity {
  /** Registered LLM provider route. */
  readonly provider: string
  /** Provider model id. */
  readonly model: string
}
```

```ts type-equiv
/** Durable ownership record for an accepted session title. */
type SessionTitleSource =
  | { readonly kind: 'fallback' }
  | {
    readonly kind: 'provider'
    readonly provider: SessionTitleProviderId
    readonly model?: SessionTitleModelIdentity
  }
  | {
    /** Explicit user rename: pins the title — automatic generation stops scheduling. */
    readonly kind: 'user'
  }
```

```ts type-equiv
/** Payload of the log-only `session/title` event. */
interface SessionTitleEventData {
  /** Normalized non-empty title text. */
  readonly title: string
  /** Exact human `user/message` seqs used to derive this title; empty for an explicit user rename. */
  readonly messageSeqs: SessionSeq[]
  /** Whether the built-in fallback, a registered provider, or the user supplied the title. */
  readonly source: SessionTitleSource
}
```

```ts type-equiv
/** Latest folded title plus the title event's durable envelope facts. */
interface SessionTitleSnapshot extends SessionTitleEventData {
  /** Seq of the latest `session/title` event. */
  readonly eventSeq: SessionSeq
  /** Timestamp of the latest `session/title` event. */
  readonly updatedAt: number
}
```

## 辅助请求记录

共享 LLM 辅助组件会在调用模型前，记录每一项已经过验证且可分发的标题请求。即使后续生成失败，载荷仍会复现模型可见的系统输入与消息输入、路由、输出上限、提供方归属和源消息归因。

```ts type-equiv
/** Exact model-visible request recorded before one auxiliary title dispatch. */
interface SessionTitleLlmRequestEventData {
  /** Registered title-provider identity responsible for the request. */
  readonly titleProvider: SessionTitleProviderId
  /** Exact human `user/message` seqs represented in `messages`. */
  readonly messageSeqs: SessionSeq[]
  /** Exact auxiliary LLM route. */
  readonly route: SessionTitleModelIdentity
  /** Exact auxiliary system prompt. */
  readonly system: string
  /** Exact auxiliary message list. */
  readonly messages: Message[]
  /** Exact auxiliary output-token cap. */
  readonly maxTokens: number
}
```

## 提供方输入与输出

自动 `first-prompt` 工作使用首消息投影。`all-prompts` 工作与每次显式刷新都会以包含式 seq 上限调用提供方加载器。提供方返回的 seq 仅可来自该请求；由服务负责的接纳流程会验证顺序、规范化标题、强制执行字节上限，并追加标题及其来源消息 seq 和来源类型。

```ts type-equiv
/** One eligible human text message exposed to title providers. */
interface SessionTitleUserMessage {
  /** Source `user/message` event seq. */
  readonly seq: SessionSeq
  /** Exact concatenated text-block content. */
  readonly text: string
}
```

`sessionTitleUserMessageOf(event)` 会在一个人类 `user/message` 事件的拼接文本块包含非空规范化文本时返回标题消息。其他事件、空文本及非文本的人类提示词都不会生成提供方输入。

```ts type-equiv
/** Fixed history cut requested before one provider generation. */
interface SessionTitleProviderMessageRequest {
  /** Live session whose committed history is being read. */
  readonly session: Session
  /** Inclusive upper event sequence captured when the generation was scheduled. */
  readonly throughSeq: SessionSeq
  /** Cancellation for supersession, disposal, or an explicit caller. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Automatic generation cadence owned by a registered provider. */
type SessionTitleAutomaticMode = 'first-prompt' | 'all-prompts'
```

```ts type-equiv
/** Immutable input supplied to one title-provider call. */
interface SessionTitleProviderRequest {
  /** Live session being titled. */
  readonly session: Session
  /** All eligible human messages through this generation revision. */
  readonly messages: readonly SessionTitleUserMessage[]
  /** Exact current logged main-request route, when one has been recorded. */
  readonly route?: SessionTitleModelIdentity
  /** Cancellation for supersession, disposal, timeout composition, or the explicit caller. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Provider output before service-owned normalization and log acceptance. */
interface SessionTitleProviderResult {
  /** Proposed title text. */
  readonly title: string
  /** Exact seqs from `request.messages` used by this result. */
  readonly messageSeqs: readonly SessionSeq[]
  /** Auxiliary LLM route, when generation used a model. */
  readonly model?: SessionTitleModelIdentity
}
```

```ts type-equiv
/** One optional asynchronous title implementation registered with the service. */
interface SessionTitleProvider {
  /** Stable id of the provider recorded with the title. */
  readonly id: SessionTitleProviderId
  /** When new human prompts start automatic generation. */
  readonly automatic: SessionTitleAutomaticMode
  /**
   * Load every eligible human text message through the requested fixed cut.
   * @param request - live session, inclusive sequence cut, and cancellation.
   * @returns ordered messages with their exact source sequences.
   * @throws when the read fails or the request is cancelled.
   */
  loadMessages(request: SessionTitleProviderMessageRequest): Promise<readonly SessionTitleUserMessage[]>
  /**
   * Produce one title revision.
   * @param request - message snapshot, current route, session, and cancellation.
   * @returns proposed title plus exact input seqs and the optional provider/model route used to generate it.
   */
  generate(request: SessionTitleProviderRequest): Promise<SessionTitleProviderResult>
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontitle--sessiontitleservice"></a>

### `ctx.sessionTitle` — `SessionTitleService`

Log-backed title fold plus asynchronous fallback generation.

```ts cordis-catalog
/**
 * Read the latest folded title from one live or replayed session.
 * @param session - session whose log is the title source of truth.
 * @returns latest title snapshot, or `undefined` before eligible input.
 */
get(session: Session): SessionTitleSnapshot | undefined

/**
 * Accept an explicit user title. Appends a `session/title` event with the
 * `user` source, which pins the title: in-flight automatic generation is
 * superseded and later user messages schedule none (an explicit
 * {@link SessionTitleService.refresh} remains the deliberate unpin).
 * @param session - exact live session to rename.
 * @param title - raw user input; normalized before acceptance.
 * @returns the accepted title snapshot.
 * @throws {SessionTitleInvalidError} when the title normalizes to empty.
 * @throws {Error} when the session is not live or the service is disposed.
 */
rename(session: Session, title: string): SessionTitleSnapshot

/**
 * Explicitly retry the registered provider, or materialize the built-in
 * fallback when no provider is registered.
 * @param session - exact live session to refresh.
 * @param signal - optional caller cancellation.
 * @returns latest accepted title, or `undefined` when no eligible text exists.
 */
async refresh(session: Session, signal?: AbortSignal): Promise<SessionTitleSnapshot | undefined>

/**
 * Register the sole optional title provider. Disposal aborts its pending and
 * active work before another provider may register.
 * @param provider - provider identity, cadence, and generation function.
 * @returns exact Cordis effect disposer, which settles after active calls quiesce.
 */
register(provider: SessionTitleProvider): () => Promise<void>
```

Types: [Session](session.zh.md)

Source: [`packages/session/session-title/src/index.ts`](../../packages/session/session-title/src/index.ts)
<!-- END GENERATED cordis-surface -->
