# `@deepseek-ai/dsh`

English | [中文](README.zh.md)

The `dsh` command is the sole supported Node application launcher: profiles are ordered stacks of plugin-bundle patch layers under the user's own overrides. SDK and ACP are profiles, not separate public bins. The Python runtime wheel packages this same command; the SDK defaults to `sdk`, and the minimal example selects `sdk-minimal`. [`src/args.ts`](src/args.ts) owns the command grammar, and [`src/bin.ts`](src/bin.ts) loads only the selected runner. Invalid commands, options from another mode, and fatal configuration or boot failures exit nonzero.

## Entry modes

| Command | Purpose |
|---|---|
| `dsh <name>` / `dsh --profile <name>` | Boot the named profile under `$DSH_HOME/profiles/<name>`. |
| `dsh --profile <name> --from-default-profile <template>` | Replace a custom profile with a fresh copy of a shipped template, then boot it. |
| `dsh --profile acp` | Serve automation clients over ACP stdio until disconnect. |
| `dsh --profile headless "job"` | Run one fresh persisted session, print the final answer, and exit. |
| `dsh --profile sdk` | Serve SDK clients over JSON-RPC stdio until shutdown or disconnect. |
| `dsh --profile sdk-minimal` | Serve SDK clients with the standalone minimal agent tree. |
| `dsh web` | Boot the Web profile. |
| `dsh plugin --profile <name> <pnpm args>` | Manage a profile's plugins by forwarding to pnpm in the profile directory. |

The invoking directory is the default workspace root. The `web`, `headless`, `sdk`, `sdk-minimal`, and `acp` profiles auto-initialize on first use from shipped templates. Create or reset another profile at a non-shipped name with `--from-default-profile`, or initialize a base-backed profile through `dsh plugin`. The `desktop` name is reserved for the Electron-owned profile, so the CLI rejects boot and config-dump requests for it. The npm CLI also rejects its plugin-management requests; the [Desktop-installed command](../desktop/README.md#bundled-command-runtime) can manage the initialized Desktop profile using that installation’s runtime.

## App arguments

The launcher parses only its own flags and hands everything after them to the booted profile, where any injected app plugin may parse the shared immutable snapshot ([`dsh-cmdline`](../../packages/boot/cmdline/README.md)). The first token the launcher does not recognize starts the app's arguments:

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

<a id="profiles"></a>
## Profiles

A profile directory holds a `package.json` (out-of-tree plugin dependencies plus the profile manifest `dsh.profile` with its ordered `bundles` list) and a `cordis.patch.yml` (the user's own patch layer). `dsh-hmr`, when enabled in YAML, watches the profile manifest and both profile and home patch files, then recomposes all layers through one serialized reload. Without HMR, changes apply on restart. Edits arriving during watcher registration use the same nonfatal reload reporting as later edits. [Plugin Manager](../../packages/boot/plugin-manager/README.md) shares package operations and the profile write lock with `dsh plugin`; package updates retain disabled bundle selections. CLI package commands inherit authentication variables and terminal descriptors, including interactive build approval; service calls retain their scrubbed environment and captured diagnostics.

Installation and profile startup enforce the declared `engines.dsh` range, or DSH peer ranges when it is absent, against the same runtime version shown by `dsh --version`. Incompatible plugins require an explicitly acknowledged exact-version exemption. The [plugin manager's compatibility reference](../../packages/boot/plugin-manager/README.md#version-compatibility-and-exemptions) documents `version-exemptions`, `allow-version`, `revoke-version`, persistence, and risks.

The tree composes over an empty root:
- each bundle's patch in `dsh.profile.bundles` order
- then the profile's `cordis.patch.yml`, then the home-level `$DSH_HOME/cordis.patch.yml`
- then `--patch` overlays

Bundles named in `dsh.profile.bundles` resolve from the dsh installation first (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`, `@deepseek-ai/dsh-sdk-app`, `@deepseek-ai/dsh-sdk-minimal`, `@deepseek-ai/dsh-acp-app`), then from the profile's own `node_modules`, where pnpm installs out-of-tree plugins.

Use `--dump-default-config` and `--dump-config` to inspect the composed tree without booting it. `--dump-config-schema` imports the composed tree's declared plugin schemas and prints JSON Schema for entries and patches instead of configuration values; read the [schema-dump safety and scope](reference/README.md#config-schema-dump) before inspecting untrusted plugins.

The [CLI behavior reference](reference/README.md) owns exact layer precedence, flags, shutdown behavior, deployment defaults, and source execution. The [startup and reload failure table](../../packages/boot/app-boot/README.md#startup-and-reload-failures) compares optional and required plugin failures with configuration HMR.

## Optional overlays

`config/examples/` ships opt-in overlays for GitHub review webhooks, memory MCP servers, and runtime Cordis tools. They are never part of a default profile; the [user guides](../../docs/user/guide/index.md) and [developer practice guides](../../docs/user/develop/practice/index.md) own setup and safety instructions.

<a id="runtime-identity"></a>
## Runtime identity

Every profile launch records Node, platform, and architecture alongside launcher-file observations. The observed launcher is the public profile bootstrap entry: `profile-boot.ts` for source launches or `profile-boot.js` for artifacts, including bundled shared-chunk execution. New records label `launcher.sha256Source` as `disk-observation`: SHA-256 covers the file read during profile initialization, which may differ from Node's cached executing module. Loaded launcher byte identity is unavailable. A tracked source launch also observes its Git revision, dirty state, and a digest of each tracked and nonignored path, entry kind, permission bits (including setuid, setgid and sticky) and content. Literal symbolic-link targets are hashed as bytes, and source observation leaves Git index bytes unchanged. Missing Git, untracked launchers, unreadable files, non-UTF-8 Git paths, and submodules make source identity unavailable. Historical records without the qualifier retain an unknown observation basis.

The CLI bundler embeds a format-2 manifest in every emitted module. `build.inputsSource: disk-observation` labels input-file digests read during `generateBundle`; these files may differ from bytes the compiler already consumed, whose identity is unavailable. One input, version, and checkout observation is shared across all output peers, even if disk files change between trailers. The version comes from the same observed CLI package-manifest bytes as its input digest; output-code digests verify emitted bytes. Artifact verification consults neither a neighboring checkout nor the current installed package version. `versionSource` distinguishes `embedded-build-observation`, source-only `package-manifest-observation`, and `unavailable`. Older unqualified manifests report unknown input identity; format 1 also has unknown version. Modified output, malformed manifests, and mismatched peers fail with a rebuild diagnostic. Disk observations identify neither cached executing code nor consumed compiler-input or external dependency bytes; [Settings](../../packages/settings/settings/README.md) records active plugins and selected configuration.

The profile launcher mounts the runtime-audit observer independently of configuration forms, including for `sdk-minimal` and custom profiles. It records active Loader entries across nested Includes, owner-selected Config values, and the LLM registry's effective provider retry policies. Loaded plugin bytes and package metadata remain unknown because Loader retains no byte snapshot for its cached module generations. The [Settings audit reference](../../packages/settings/settings/README.md) defines these records and reload behavior.

## Development

Production runs require built package and frontend artifacts. From the repository root, run `pnpm run build` separately, then use `pnpm dsh <args...>` to run the TypeScript entry and forward every argument; the [source-execution reference](reference/README.md#source-execution) owns the module-resolution contract.

The `@deepseek-ai/dsh/profile-boot` export provides the shared profile lifecycle to the Desktop host. A resolved application profile supplies its own installation anchor for runtime package resolution while retaining the Harness home patch, proxy environment, telemetry switch, patch reload, and bounded shutdown.

Packaged installations call the same `runCli()` entry with their package-manager executable. The Desktop carrier also enables plugin operations for its initialized profile; npm launches omit these options. Installation-owned package environments apply only to plugin package operations; the invoking directory, ordinary profile selection, and agent-shell PATH retain their CLI meanings.

The [Web failure matrix](tests/profiles/web/tests/web-failure-matrix.expected.e2e.ts) runs the built CLI through startup failures and native configuration HMR with `awaitWriteFinish` enabled in `test:expected`. It verifies authenticated HTTP responses, diagnostics, recovery, process exits, and disposal without model API calls; the [startup acceptance](tests/profiles/web/tests/web-best-effort-startup.expected.e2e.ts) also covers the shipped required Web dependencies and port conflicts.
