---
kind: upgrade-guide
description: "Plugin Manager refuses to disable the UI and settings dependencies needed to restore plugin configuration."
---

# Preserve the plugin management interface

English | [中文](guide.zh.md)

## Change

Plugin Manager protects the settings, layout, rendering, sidebar and locale components required by its Web interface, in addition to its existing protected services. Calls that previously disabled these dependencies now return `management-required`. Built-in plugin switches expose the same restriction before a write; ordinary configurable plugins remain editable.

## Migration

1. Clients calling `setPluginEnabled` must honor `listPlugins().readOnlyReason`; preset clients use `listPresetPlugins()` and `setPresetPluginEnabled()`.
2. If an older test profile explicitly disabled a management dependency, remove that override from its `cordis.patch.yml` before opening the Web interface.
3. Open **More → Settings → Built-in plugins**. Verify that editable entries have working switches and management dependencies show a disabled switch with its reason. Preset changes apply to new sessions.
