# Customization

English | [中文](README.zh.md)

## Summary

This directory documents supported ways to extend DeepSeek Harness without maintaining a divergent copy of official packages. Prefer profile bundles for installable composition, ordinary Cordis plugins for behavior on public extension points, and complete capability seams when a new provider/consumer contract is required.

## Contents

- [Triple-A quality program](aaa-quality-program.md) — executive priorities, risk-ordered roadmap, status ownership, human decisions, and release stop conditions.
- [Improvement development standard](improvement-development-standard.md) — mandatory design sequence, solution-type selection, compatibility rules, and evidence requirements.
- [Repository configuration report](repository-configuration-report.md) — recorded fork topology, protection, automation, registered improvements, and verification scope.
- [Repository audit report — 2026-09-20](repository-audit-2026-09-20.md) — current quality decision, executed evidence, findings, and remediation order.
- [Upstream-safe customization](upstream-safe-customization.md) — permanent branch topology, update procedure, executable delta ownership, and recovery.
- [Fork v2 implementation report](fork-v2-implementation-report.md) — concise implementation answer, delivered artifacts, verification evidence, and maintenance path.
- [Fork v2 extraction](fork-v2-extraction.md) — comparison of the experimental fork with the official repository, the shipped resilient-compaction slice, and the boundary for each remaining idea.
- [Plugin configuration tutorial](../user/develop/basic/config.md) — mount a local Cordis plugin through a patch.
- [Publishing a bundle](../user/develop/basic/publish.md) — package a patch layer and install it into a profile.
- [Profile composition](../../packages/boot/app-boot/README.md) — layer order, user patches, and runtime reconciliation.

## Selection rule

Complete the [improvement development standard](improvement-development-standard.md) before production implementation. It distinguishes configuration, profile patches, plugins, bundles, skills, libraries, capability seams, focused upstream package changes, and repository automation; the selected type must match the behavior and lifecycle owner.
