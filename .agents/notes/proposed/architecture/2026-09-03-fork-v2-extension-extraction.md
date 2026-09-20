# Agent Note: Extract fork v2 experiments as independent extensions

Status: proposed

English | [中文](2026-09-03-fork-v2-extension-extraction.zh.md)

## Problem

The `deepseek-harness-v2` fork combines valuable experiments with changes across a large part of the repository and generated engineering artifacts. Merging it as a long-lived branch would replace current official behavior, duplicate capabilities that upstream already supplies, and make every upstream update a cross-repository reconciliation exercise. The compaction stall has an extension-only fix, but the remaining quality, hierarchical compaction, integrity, redaction, Web transport, and workflow ideas do not all share one valid package boundary.

The repository branch topology and custom-delta ownership are separate process decisions recorded in [the upstream-safe customization branch note](../../implemented/process/2026-09-20-upstream-safe-customization-branch.md).

## Proposal

Treat the fork as an evidence corpus and extract only behavior with a named owner and independently testable public contract. Each slice will be a standalone plugin or complete capability seam, published separately; a thin optional bundle will compose only accepted slices. No slice will copy an official preset, patch `agent-loop`, invent a required session event that becomes unreadable when removed, or claim same-process integrity checks provide sandbox isolation.

The extraction will proceed in the following dependency order:

1. Propose upstream auxiliary-call events that record the effective request controls and can represent multiple compaction calls without overloading `compaction/summary.llmStreamCall`. Only after that contract lands may a hierarchical summarizer become an alternative Compaction Service Provider.
2. Decompose the fork's quality framework into a complete evaluation seam: a Service Definition for evidence and verdicts, at least one replaceable local Service Provider, and an explicit Consumer that decides whether evaluation affects a workflow. Scores will be session-visible only when reconstructable events and projection ownership are defined.
3. Propose loader-owned extension metadata and content-integrity verification separately from execution isolation. The loader will own manifest validation and package identity; an actual sandbox provider will own authority reduction if one is required.
4. Split redaction by data flow. Telemetry policy will use the existing `session-telemetry/record` redact waterfall; model-input and persistence transformations will require their own explicit contracts and must not silently rewrite one another's data.
5. Compare Web transport and workflow-control experiments against the current official seams operation by operation. Only a demonstrated missing operation with lifecycle and durability tests will become a focused extension; existing official behavior will remain untouched.
6. Compare persistent terminal-tool output with the foreground Bash and PowerShell result schemas. A parity gap belongs upstream in those tool packages with durable result metadata; an optional plugin must not replace an already registered `bash` or `pwsh` tool, and transient generic tool values do not establish replayable execution facts.

The fork's generic execution-result classifier, existing foreground execution results, output retention/spill, OAuth support, fail-closed compaction, durable overflow recovery, and generated repository-analysis artifacts are excluded from extension extraction because official packages already own the runtime capability, the remaining parity work requires an upstream package change, or the artifact is development evidence rather than product behavior.

## Alternatives considered

**Maintain the fork as the product branch.** Rejected because its broad diff makes upstream the recurring merge target rather than the source of truth and couples unrelated experiments into every release.

**Publish one compatibility mega-plugin.** Rejected because quality evaluation, loader integrity, redaction, compaction, Web transport, and workflow control have different services, security boundaries, durable facts, and removal behavior. One package would hide incomplete seams and make configuration and failure ownership ambiguous.

**Patch official private fields or import `src/*` implementation modules.** Rejected because source-only paths and private state are not published contracts. Such a plugin can pass in the monorepo and fail from a packed installation or after an ordinary upstream refactor.

**Record every plugin decision in a custom session event.** Rejected because removable third-party bundles cannot currently append an ignorable typed event through the public Session API. Required unknown events make old sessions fail to load after package removal.

## Acceptance criteria

- Every extracted package names one public event or service entry point it consumes and passes a packed-install or real Loader-path smoke test.
- Every model-visible input and behavior-changing verdict is reconstructable from official session events or an accepted upstream event extension.
- Each capability seam includes Service Definition, Service Provider, and Consumer roles before it is described as complete.
- Configuration exposes every deployment-varying choice, rejects unknown keys, and fails unsupported references at the earliest resolvable point.
- Lifecycle tests cover cancellation, disposal, concurrency, partial failure, and absence of post-dispose work without wall-clock sleeps or shared ports.
- Bundle removal leaves official profile files untouched and every stored session readable by the official repository.
- Documentation under `docs/customization/` and each package README identifies official overlap, installation, limits, and the capability deliberately not duplicated.

## Risks

The public extension surface may be insufficient for recording effective request controls, model-input redaction, or loader isolation, so those slices can remain blocked on narrowly reviewed upstream changes. Evaluation and hierarchical summarization can add significant token and latency costs if consumers enable them without explicit budgets. Integrity metadata can create false confidence if documentation blurs identity verification with authority isolation. A thin bundle reduces merge drift but still needs compatibility testing against each supported official release.
