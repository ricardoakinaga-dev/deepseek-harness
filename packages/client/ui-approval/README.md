---
description: "Browser approval UI that answers Host permission requests through the scoped interaction path."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval

English | [中文](README.zh.md)

## Summary

Mount this browser plugin when a Host approval request must pause the Conversation composer for a user's decision. It projects the scoped `approval/request` waterfall into the Session UI, offers allow-once or reject, and returns the outcome to the waiting Host operation. An optional Session-scoped detail Slot can render the correlated Tool call. Persistent permission policy remains owned by Host-side approval packages.

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

Mount `@deepseek-ai/dsh-client-ui-approval` in a Web composition that already provides `ui-session`, `ui-conversation`, the Client Remote Event bridge, locale service, and the Host [`user-approval`](../../interaction/user-approval/README.md) package. The browser row has no package configuration; its `./client` entry contributes the interactive surface.

### Request flow

When a scoped `approval/request` arrives with a Session owner, the plugin creates a pending presentation and replaces the `conversation.composer` fallback. The panel shows the request reason or a localized escalation message with the tool name, renders correlated detail when `callId` is present, and returns `allowed-once` or `rejected` when the user chooses an action.

Requests without a Session scope call the next waterfall listener immediately. The listener also delegates when the pending presentation is disposed, aborted, or otherwise cannot answer, so the Host can apply another answerer or fail closed.

### Extending the detail

The plugin declares `conversation.approval.detail` as a Session-scoped single child Slot. An extension registers a renderer for that Slot and receives `ApprovalDetailOwnerProps.callId`; the approval package owns the request lifecycle and the extension owns only the correlated Tool presentation.

### Failure and lifecycle behavior

`PendingApproval.result` remains pending until the user answers, the request signal aborts, or the owner delegates. Each terminal path removes its abort listener and rejects or resolves the same promise once. Plugin and Session teardown first delegate the waiting request, then await the owner completion before removing the visible pending interaction.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host entry is an empty browser-only loader body. The Client entry registers the `approval` locale namespace, publishes `PendingApproval` through `uiSession` with precedence `0`, and injects a priority-`1` chain occupant into `conversation.composer`. Its selector matches only this package's pending-interaction discriminator, so unrelated question or plan presentations remain available to their own consumers.

`PendingApproval` owns one request's identity, Session id, optional Tool call id, reason, abort signal, and one-shot settlement. `answer()` resolves the Remote Event with the selected decision; `delegate()` rejects with an internal marker that the listener translates into `next()`; `abort()` forwards the transport or scope failure. `ApprovalPanel` keeps the action buttons disabled after the first attempt and resets them if settlement reports an error.

All product-visible copy comes from the `approval` locale dictionary. The optional detail Slot is rendered only when the request has a `callId`, and the Slot receives no approval resolver, so a detail renderer cannot answer or change the Host decision.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host loader entry for the browser-only plugin |
| [`src/client/index.ts`](src/client/index.ts) | Locale registration, pending-interaction publication, composer chain, and Remote waterfall listener |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | Approval request, decision, pending-settlement, and detail Slot contracts |
| [`src/client/ApprovalPanel.tsx`](src/client/ApprovalPanel.tsx) | Localized approval composer and optional detail renderer |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese approval copy |
| [`tests/ui-approval.client.spec.tsx`](tests/ui-approval.client.spec.tsx) | Pending settlement, delegation, abort, slot selection, and component behavior |

No runtime invariant companion is published because Cordis registries own the Remote listener, locale namespace, pending domain, and Slot registration; this package has no independent observation that could diverge from those owners.

</details>

<a id="further-exploration"></a>
## Further Exploration

Read these pages for the Host decision, Session interaction registry, and composer extension point.

- [user-approval](../../interaction/user-approval/README.md) — owns the Host approval outcome, policy, and fail-closed decision service.
- [ui-session](../ui-session/README.md) — projects pending interactions and owns Session-scoped UI sources.
- [ui-conversation](../ui-conversation/README.md) — declares the `conversation.composer` chain and its owner props.
- [Web Client Slots](../../../docs/subsystems/slots.md) — defines Slot declaration, scope, child ownership, and lifecycle.
- [Approval subsystem](../../../docs/subsystems/approval.md) — documents the `approval/request` waterfall and outcome vocabulary.

<a id="model-experience"></a>
## Model Experience

None, as this package presents approval requests in the browser and registers nothing model-facing.

#### KV Cache effect

None; approval request and response rendering does not alter a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Only one-shot decisions are available** — the UI returns `allowed-once` or `rejected`; remembered grants, revocation, and persistent permission policy belong to Host packages.
- **The presentation is Session-scoped and process-local** — a request without a Session delegates, and a browser composition restart does not reconstruct an old pending panel from the Session log.
- **Tool detail is optional** — the detail child Slot is available only when the request carries a `callId`; the approval package cannot synthesize a Tool view for requests without that identity.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
