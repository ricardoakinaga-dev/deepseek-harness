---
description: "React and Slot adapters for Session Controller lists, interaction state, and per-session context."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-session

English | [中文](README.zh.md)

## Summary

Mount this plugin to expose Session catalog, retain information, unified UI status, and Session-scoped sources through the standard Slot inputs. It connects `ClientSessions` to the renderer without putting React hooks on Session models, and lets domain plugins add typed sources or pending interactions. `SessionProvider` can inherit an outer binding or target an explicit `SessionReference`; Controller transport, history, and references remain owned by the Session Controller.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount `@deepseek-ai/dsh-client-ui-session` in a Web composition that already provides the Session Controller, Remote Events, Slot registry, and UI renderer. The plugin has no package configuration; its browser entry installs the root sources and the `session` and `session-maybe` scope adapter.

### Root Session inputs

Every rendered scope can receive `useSessions`, `useSessionStatus`, and `useSessionRetainInfo`. The first selects the Controller list and current selection, the second selects running, pending-interaction, and completion-reminder status by Session id, and the third reads reference counts without retaining a Session.

The root source does not choose a global current Session from list order. It follows the Session retained by `mainView`; when that retention disappears, it selects another Session that still owns `mainView`, or publishes an absent binding.

### Session-scoped inputs

Declare a `session` or `session-maybe` child Slot to receive `SessionProvider`. A Provider without an explicit reference inherits its surrounding binding. An explicit `SessionReference` targets that Session for the subtree, while `undefined` selects the absent branch of a `session-maybe` child. Strict `session` children require a binding; `session-maybe` children expose optional `sessionId`, `useSession`, and `useProjection` results.

Each Session binding also supplies the built-in `useSession` source, `sessionId`, and keyed `useProjection` source. The binding source stays stable for one Controller-owned `SessionBinding` and changes to the absent projection when that generation ends.

### Domain contributions

Call `ctx.uiSession.provide()` from a domain plugin to add Session-scoped observable hooks, keyed hooks, or plain props. Declare each name in the descriptor roster and return every declared value from `resolve(binding)`. The adapter rejects undeclared values, missing values, duplicate generated prop names, and collisions between contributors.

Use `ctx.uiSession.registerPendingInteraction(precedence)` for an answerable Session interaction. Publish a value with its delegation callback; the returned disposer removes that value. For each Session, the adapter exposes the highest-precedence published interaction through `useSessionStatus` and delegates active values before a domain is disposed.

### Failure and lifecycle behavior

`bindingSource(reference)` returns the absent source for no reference or an inactive adapter and rejects a reference from another active Controller generation. A released reference is not silently rebound to a replacement with the same Session id. Source listeners are notified after a new materialized snapshot is committed, and one listener failure does not prevent the others from running.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`UiSession` owns one root source, one current-main source, one absent projection, and one stable source per live `SessionBinding`. It subscribes to the Controller list and the scoped `api-session/status` event, then publishes status from the latest list baseline, running transitions, pending interactions, and completion reminders. The renderer consumes these bare sources through `SlotScopeAdapter`; no component receives `Context` or a Session model hook.

Source materialization combines the built-in Session, projection, and identity values with domain descriptors. A descriptor is registered through a Cordis effect, so disposal removes its contribution and rebuilds every live binding. Binding cleanup changes only that generation's source to absence, which prevents an old Context from invalidating a same-id replacement.

Pending-interaction domains keep owner delegates with their transient values. Domain teardown first removes the visible value, then awaits every delegate, so a waiting Remote waterfall can continue before the domain's effect finishes. The `SessionPendingInteractionMap` declaration merge lets each UI feature contribute its own discriminated pending value without centralizing feature contracts.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host loader entry for the browser-only adapter |
| [`src/client/index.ts`](src/client/index.ts) | Root and Session-scoped sources, status projection, provider adapter, and extension APIs |
| [`src/client/session-provider.tsx`](src/client/session-provider.tsx) | Empty-binding and bound-Session render branch |
| [`tests/ui-session.client.spec.ts`](tests/ui-session.client.spec.ts) | Source identity, scope, status, contribution, pending-interaction, and disposal behavior |

No runtime invariant companion is published because the adapter's source identity and effect disposal are observed directly by its service tests, while registries own the relations that would otherwise need an independent invariant.

</details>

<a id="further-exploration"></a>
## Further Exploration

Read these pages for the model layer, the renderer, and the Slot rules this adapter implements.

- [Session Controller](../../api/session-controller/README.md) — owns Client Session models, references, baselines, and transport.
- [ui-slots](../ui-slots/README.md) — defines standard props, scope adapters, and Slot registration lifecycles.
- [ui-renderer](../ui-renderer/README.md) — binds the adapter's bare sources to React hooks.
- [Web Client architecture](../../../docs/subsystems/web-client.md) — places Session models, adapters, and presentation packages.
- [Web Client Slots](../../../docs/subsystems/slots.md) — specifies `session`, `session-maybe`, Providers, and source contributions.

<a id="model-experience"></a>
## Model Experience

None, as this package adapts browser-side Session state and registers nothing model-facing.

#### KV Cache effect

None; Session selectors, status sources, and Slot scopes do not assemble model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Pending interactions are process-local** — they are not reconstructed from the Session log; the owning Remote waterfall must publish a waiting request again after the browser composition is restarted.
- **Session sources depend on the active Controller generation** — a reference from another generation is rejected, and a generation that ends publishes absence instead of silently following a same-id replacement.
- **Domain sources require a declared roster** — a contributor cannot add arbitrary hook, keyed-hook, or prop names from `resolve`; the descriptor and declaration merge must be updated together.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
