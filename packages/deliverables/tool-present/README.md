---
description: "Declare accessible files as deliverables with present; configuration, Session ownership, and source-file opening."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present

English | [中文](README.zh.md)

## Summary

Use `present` to declare final files accessible through the Session filesystem, including files created through shell commands. Users open the current source files in their default application. The tool preserves an immutable copy of each file within the configured byte limit. Source edits or deletion do not change the saved bytes included in Session ZIP exports.

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

Shared output and file-link guidance comes from [`dsh-deliverable-file-references`](../deliverable-file-references/README.md), mounted separately by Web and SDK bundles.

`present` validates paths against the Session's current working directory and records absolute paths, so later directory changes do not redirect delivered files.

The `standard`, `ptc`, and `cordis` agent presets mount this plugin. Call `present` with `files: [{ path, description? }]` after creating the files. Files must be regular files accessible through the Session filesystem. Relative paths resolve against the Session working directory; absolute paths may name files outside it, including `/tmp` or Downloads. Missing files, directories, final symbolic links, and provider-denied paths fail the call. Files in a shell sandbox’s private `/tmp` must first be written somewhere the Session filesystem can access.

Mount it in an agent's Cordis composition with `tools`, `fs`, `attachments`, `workingDirectory`, and the `turnBoundary` Session projection available:

```yaml
- name: '@deepseek-ai/dsh-tool-present'
  config:
    maxFiles: 8
    maxFileBytes: 20971520
```

| Field | Default | Meaning |
|---|---|---|
| `maxFiles` | `8` | Positive maximum file count per call |
| `maxFileBytes` | `20971520` (20 MiB) | Inclusive per-file capture limit; a positive safe integer below `Number.MAX_SAFE_INTEGER` |

Both limits are validated at mount. A file above `maxFileBytes` is declared with `capture.status: too-large` and the applied byte limit; the result tells the model to retain its original. Files exactly at the limit and empty files are captured. The tool requires an agent Session and an open turn. Delivery belongs to the calling Session; a parent must call `present` itself to declare files created by a subagent.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The tool resolves paths and reads bounded raw bytes through the configured filesystem provider, including files outside the workspace. It saves files sequentially through `attachments.saveFileStream` before returning their content-addressed references. Each stored reference carries the sanitized filename, exact byte count, and SHA-256 identity. Oversized files carry an explicit non-capture outcome; other read or storage failures fail the call without publishing a delivery event. Cancellation reaches reads and streamed writes. Already committed objects from a failed, cancelled, or blocked call may remain unreferenced under the attachment store’s retention policy. Successful final `tools/result` notifications append `deliverables/presented`, including nested calls. A later enclosing program failure does not revoke an already completed declaration. Blocked results publish none. Each plugin instance records only calls it executed; scoped tools with the same name cannot publish through another instance.

The pure `./types` entry declares `PresentedFile` and the Session event without importing Host runtime code. The Web consumer validates persisted declarations before displaying or opening them. New declarations store absolute paths. Legacy relative declarations retain the viewed Session's original workspace as their base.

The optional `capture` field is absent in historical declarations; absence does not imply a saved copy. Stored references remain independent of the original path.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Filesystem subsystem](../../../docs/subsystems/filesystem.md) — provider paths and errors.
- [Web deliverables](../../client/ui-deliverables/README.md) — source-file opening and cards.
- [Delivery decision](../../../.agents/notes/implemented/feature/2026-09-08-present-workspace-source-files.md) — Session ownership and required-on-read events.

<a id="model-experience"></a>
## Model Experience

### present

#### What the model sees

The [present schema](../../../docs/tool-catalog.md#present) asks for existing accessible files: “Declare existing files as final deliverables for the user. Hosts may show presented files only after your turn ends, so call it once the files are final. If the user needs to review files earlier, such as before a tool call that waits for their answer, link them in your message instead. Use it when the user needs a separate file, especially Office documents, spreadsheets, and slide decks; prefer your final response when that suffices. A saved copy preserves the presented bytes within the configured file-size limit; larger files are declared without a saved copy. The original path remains available for opening the current file.” The `files` parameter asks for the 1-2 most important deliverables and at most 4 per call. Captured files report `Presented <path>`. Oversized files report `Presented <path> (not saved: exceeds <maxBytes> bytes; keep the original file)`. The program result and durable event contain paths, optional descriptions, and capture outcomes.

#### Token effect

One tool schema per mounted agent and one result line per delivered file. File bytes do not enter model messages.

#### KV Cache effect

The tool schema is static for the mount lifetime. Delivery result text extends the conversation without rewriting its prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Metadata and Host-path checks cannot atomically prevent replacement before a desktop application opens a file.
- Native opening and source previews use the current original path. Saved attachment objects must not be passed to editors as writable files.
- Historical declarations and oversized files have no saved bytes. Captured files use attachment storage without automatic cleanup; editable copies and their retention require a separate owner.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
