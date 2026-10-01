---
description: "Optional ChatGPT account login for the OpenAI Codex model provider in the Web Models page."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-codex-login

English | [中文](README.zh.md)

## Summary

This optional Web bundle adds **Sign in with ChatGPT** to the `openai-codex` provider card. It uses the OAuth flow registered by `dsh-llm-pi-ai` and stores the resulting grant through the existing credentials service.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Install the bundle into a Web profile with `dsh plugin --profile web add @deepseek-ai/dsh-experimental-codex-login`, or enable it in the Web plugin manager. Add the `openai-codex` model provider in **Settings → Models** and save it without an API key. Click **Sign in with ChatGPT**, open the authorization page, and finish login. If the browser cannot reach the callback server on the DSH machine, paste the authorization code or redirect URL into the same provider card. **Sign out** deletes the locally stored OAuth grant.

An `apiKeyEnv` reference in the provider configuration takes precedence over the OAuth grant; remove the reference to use account login. The profile must mount `dsh-llm-pi-ai`, the authorization service, and a writable credentials provider.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The Host exposes a typed Remote stream for one login attempt. Its authorization URL and manual-code prompt go only to the browser that started the stream; the browser sends a code back on the same connection. The OAuth token remains in the Host credential store. Closing the stream withdraws its attempt. The Client registers a keyed `settings.models.provider-card` extension for `llm-pi-ai` and renders only on `openai-codex` rows.

No invariant companion is published because the plugin owns no independent persistent state; the authorization and credential services own the only state it reads.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package configures an existing provider credential without adding model requests or Session events.

#### KV Cache effect

No direct effect; the selected model and its request content are unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations"></a>

- The callback listener binds to port 1455 on the DSH host. A browser on another machine usually needs the manual-code field.
- The OAuth attempt is transient; reload the page to start a new attempt. Sign out removes the local grant but does not revoke it at OpenAI.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

The Web card uses the existing provider-card slot and the pi-ai authorization flow; the bundle adds no new authorization protocol.

</details>
