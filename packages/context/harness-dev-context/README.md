---
description: "Model context for users and maintainers of the Web GUI that names the DeepSeek Harness checkout and GUI URL without letting either change the system prompt."
kind: "package-reference"
---

# @deepseek-ai/dsh-harness-dev-context

English | [中文](README.zh.md)

## Summary

`dsh-harness-dev-context` tells an agent which Web GUI serves it and how that GUI relates to "this page". Checkout and rebuild guidance applies automatically to Sessions working inside the serving Harness checkout, with deployment overrides. The system prompt carries value-free guidance; current paths and URLs arrive as logged runtime context. Sessions whose prompt embeds values from earlier releases keep those paragraphs verbatim.

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

The shipped Web bundle mounts this plugin as its `harness-dev-context` row. Disable that row in a profile patch when the agent should not learn the harness checkout or GUI URL. The plugin activates only where every injected service exists: `systemPrompt`, `sessionProjections`, `workingDirectory`, and the `webApp` service of the Web runtime, so `--help` and non-Web compositions never mount it.

| Field | Default | Meaning |
|---|---|---|
| `developmentContext` | `auto` | `auto` enables checkout and rebuild guidance only when the Session's effective working directory physically lies inside the serving installation's Git checkout; `always` enables it for every Session; `never` omits it. Other mode values fail configuration validation. |

`auto` accepts the checkout root, descendants, and links into that checkout. Matching directory names, other checkouts, parent directories, and links out of the checkout do not qualify. Installed packages without checkout Git metadata and assemblies without a Session receive only GUI orientation. The directory comes from `workingDirectory.get(session)`, including committed directory changes, rather than the immutable original-project header or the process launch directory.

### What the model gets

GUI orientation always explains that "this page" means this GUI, that the browser supplies no implicit page observations, and that replacement servers require a user request. Development-enabled Sessions also receive the checkout/working-directory distinction and the full official GUI rebuild guidance. Runtime context names the installation root four directories above this package only when development guidance is enabled; it always names the advertised Web GUI URL from `webApp.getAdvertisedUrl()`, the same value as `DSH_WEB_URL` and the startup URL. Runtime context follows the shared snapshot rules: an unchanged value adds nothing, and a changed one appends a snapshot before the step's input instead of rewriting earlier messages. Guidance reaches the model through normal logged system messages; the plugin never edits model requests directly.

### Sessions from earlier releases

Earlier releases embedded both values in the system prompt. When a Session's latest nonempty system prompt still contains those exact paragraphs, the sections repeat them verbatim in every mode, old values included, so upgrading and later port or checkout changes preserve those paragraphs; runtime context supplies the current URL and, when development guidance is enabled, checkout path. Text that only resembles an earlier paragraph receives the current policy-selected guidance.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design of the plugin; the observable behavior is covered in [Use this package](#use-this-package).

### Design concept

A host-only session projection, `harnessDevLegacyPrompt`, folds every committed nonempty `system/message` into the earlier-format paragraphs it contains, matched by their fixed text around the value on one line. The section text providers read that state through `AssembleContext.agent`; otherwise they apply the configured development policy. The projection is restored with every other unit when a Session resumes, so no historical event is read synchronously.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: sections, runtime contexts, earlier-format projection |

### Main flow

Activation awaits the projection handle before registering both sections and both contexts. At each assembly the sections choose the admitted earlier paragraph or the policy-selected guidance; at each request admission the contexts read the effective directory and advertised URL. Disposing the plugin fiber removes every registration.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the decision record to the services this plugin reads.

- [Process-specific values as runtime context](../../../.agents/notes/implemented/bug-fix/2026-10-11-process-specific-prompt-values-in-runtime-context.md) — why the values left the system prompt and how earlier Sessions stay stable.
- [Session projections subsystem](../../../docs/subsystems/session-projection.md) — the projection contract the earlier-format state uses.
- [Web app bundle](../../bundle/web-app/README.md) — the `webApp` service and the row that mounts this plugin.
- [Context group map](../README.md) — sibling request-context packages.

-----

<a id="model-experience"></a>
## Model Experience

### Harness checkout and Web GUI

#### What the model sees

Development-enabled Sessions receive two system-prompt paragraphs at first-party orders 10000 and 10100, after reusable instructions, and two runtime-context lines at context orders 200 and 210. Other Sessions omit the source paragraph, source runtime value, and Web development sentences while retaining GUI orientation and its URL. A Session admitted under an earlier release keeps its exact earlier paragraphs instead of the two below.

##### System-prompt paragraphs

```markdown
The runtime context names the DeepSeek Harness implementation checkout. The checkout location and current working directory are separate values and may differ; never infer the working directory from the checkout path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.

You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. The browser provides no implicit DOM, route, or screenshot context. The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while `pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. Starting another server does not update this GUI. The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.
```

##### Runtime-context lines

```markdown
Current DeepSeek Harness implementation checkout: "<installation root>".

Current DeepSeek Harness Web GUI URL: "<advertised URL>".
```

#### Token effect

Development-enabled Sessions receive two prompt paragraphs and two runtime-context lines; other fresh Sessions receive one shorter GUI paragraph and one URL line. A changed checkout value, URL, or development eligibility adds a runtime-context snapshot.

#### KV Cache effect

For unchanged development eligibility, the system prompt is identical across checkout values and ports; changed values append a runtime-context snapshot after the cached prefix. Changing policy or moving a Session into or out of the checkout changes its nonlegacy guidance through the normal logged system-prompt update mechanism.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what the stability guarantee covers. They are current package constraints.

- **Two paragraphs only** — other system-prompt text that changes between releases still rewrites the first system message on routes without in-history prompt updates.
- **Earlier values stay** — an earlier-format Session keeps its old checkout path and URL in the system prompt for its whole lifetime; only the later runtime-context lines are current.
- **Mixed releases** — a release without this package rewrites the first system message of a Session started with it, so every checkout that serves a shared `DSH_HOME` needs this package before they alternate.
- **Optional values** — the two runtime-context lines are optional, so a custom persona that sets `includeRuntimeContext: false` without `complete: true` keeps the sections that point at values its requests never carry. The shipped `minimal` persona sets both.
- **Sessions without the sections** — a Session created while `surfaceContext: false` hid both paragraphs has neither in its log, so the first resumed request adds the new sections and rewrites the first system message on routes without in-history prompt updates.
- **One earlier wording** — the projection recognizes the paragraphs as the release immediately before this package rendered them; a Session holding an older wording gets the current guidance.
- **Serving checkout only** — `auto` recognizes this installation's Git checkout, not other Harness clones. Use `always` when development guidance is appropriate outside it. `never` suppresses new development guidance and the current checkout value; it does not erase already admitted legacy paragraphs.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
