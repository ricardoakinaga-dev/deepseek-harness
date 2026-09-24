---
description: "Observable browser state stores with explicit snapshots, subscriptions, and lifecycle ownership."
kind: "package-library"
---
# @deepseek-ai/dsh-client-store

English | [中文](README.zh.md)

## Summary

Use this library to publish browser-side state as stable snapshots without importing React. It provides synchronous or animation-frame subscriptions, Immer draft updates, whole-value replacement, shallow equality, optional `localStorage` persistence, and typed action handles for Slot registrations. The library owns state publication; `ui-renderer` creates selector hooks at the React binding site.

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

Import this library from Client controllers, Slot adapters, or browser-safe feature code that needs an observable state source. It is a dependency, not a Cordis plugin, so it has no profile-install or `cordis.yml` entry.

### Snapshot stores

`createSnapshotStore` is the direct entry point. `getSnapshot()` returns the current state, `subscribe()` returns an unsubscribe function, `update()` applies an Immer draft mutation, and `set()` replaces the state.

```ts
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

const store = createSnapshotStore({ draft: '' })
const unsubscribe = store.subscribe(() => {
  console.log(store.getSnapshot().draft)
})
store.update(state => { state.draft = 'ready' })
unsubscribe()
```

The default `sync` flush notifies subscribers in the same state update. Pass `{ flush: 'raf' }` to coalesce updates until the next animation frame; environments without `requestAnimationFrame` use one microtask flush. Pass `{ persist: { name } }` to opt into whole-value JSON persistence in browser `localStorage`.

### Declarative stores

`defineStore` turns an initial-state factory, optional persistence key, and complete draft-action table into a typed handle. The framework creates an instance for each registration and scope; components receive `useStore` and the baked actions rather than `update`, `set`, or the engine instance.

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

Use a shared handle when registrations must share one identity. Pass a factory when each registration needs an exclusive handle. A scoped persistence key appends the Session key, so each Session instance uses a separate browser entry.

### Failure and lifecycle behavior

Subscriber callbacks run from a copied listener set. One callback failure is logged and does not prevent later callbacks. Browser storage read, write, parse, quota, and private-mode failures disable only the affected persistence operation; they do not reject a state update. `clearPersisted()` is explicit cleanup and is not called automatically when a runtime scope ends.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The engine wraps Zustand's vanilla store with Immer and publishes the resulting state through the framework-neutral `ObservableSnapshot` contract. `raf` mode subscribes one internal scheduler and fans out one coalesced notification; `sync` mode forwards each update. `set()` bypasses Immer and deep-freezes the replacement outside production so wholesale state replacement keeps the same development safety as draft updates.

`defineStore` keeps the declaration on a handle and creates a fresh engine instance from `init()`. It derives a persistence key from the root key or the optional Session scope key, then binds every declared draft action to that instance. Slot render machinery owns instance creation and turns each bare source into a selector hook; this package never creates a React hook.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Snapshot engine, persistence, notification helpers, and declarative store implementation |
| [`src/contract.ts`](src/contract.ts) | Framework-neutral observable, selector, store, and action contracts |
| [`tests/store.client.spec.ts`](tests/store.client.spec.ts) | Store publication, batching, persistence, action, and lifecycle behavior |

No runtime invariant companion is published because store instances have no process-global ownership relation to compare; their observable behavior is covered by the package tests.

</details>

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the store contract is part of a larger Client composition.

- [ui-slots](../ui-slots/README.md) — declares Slot store handles and derives component store props.
- [ui-renderer](../ui-renderer/README.md) — binds bare snapshot sources to React selector hooks.
- [Web Client architecture](../../../docs/subsystems/web-client.md) — assigns state ownership between models, stores, and presentation packages.
- [Web Client Slots](../../../docs/subsystems/slots.md) — defines store lifecycle, scope, and component input rules.

<a id="model-experience"></a>
## Model Experience

None, as this package provides browser-side state primitives and registers nothing model-facing.

#### KV Cache effect

None; the stores neither assemble nor send model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Persistence is browser-local** — persisted values use JSON in `localStorage`; non-browser runtimes disable persistence, and the package provides no cross-device synchronization.
- **Persisted keys must be unique per live scope** — two independently created instances that resolve to the same key share one storage entry; callers own key selection outside framework-managed registration.
- **Static browser imports remain build input** — the library keeps its third-party ESM imports for the Web shell; independent consumers provide the package's development dependencies according to the Client dependency rules.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
