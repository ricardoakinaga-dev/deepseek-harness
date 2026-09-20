# Customization

English | [中文](README.zh.md)

## Summary

This directory documents supported ways to extend DeepSeek Harness without maintaining a divergent copy of official packages. Prefer profile bundles for installable composition, ordinary Cordis plugins for behavior on public extension points, and complete capability seams when a new provider/consumer contract is required.

## Contents

- [Upstream-safe customization](upstream-safe-customization.md) — permanent branch topology, update procedure, executable delta ownership, and the reusable improvement model.
- [Fork v2 implementation report](fork-v2-implementation-report.md) — concise implementation answer, delivered artifacts, verification evidence, and maintenance path.
- [Fork v2 extraction](fork-v2-extraction.md) — comparison of the experimental fork with the official repository, the shipped resilient-compaction slice, and the boundary for each remaining idea.
- [Plugin configuration tutorial](../user/develop/basic/config.md) — mount a local Cordis plugin through a patch.
- [Publishing a bundle](../user/develop/basic/publish.md) — package a patch layer and install it into a profile.
- [Profile composition](../../packages/boot/app-boot/README.md) — layer order, user patches, and runtime reconciliation.

## Selection rule

Use a plugin when the official repository already exposes the event or service needed by the behavior. Use a bundle when users need to install and configure one or more plugins as an ordered profile layer. Propose an upstream extension only when the existing public surface cannot preserve durable request facts, lifecycle ownership, or a complete Service Definition / Service Provider / Consumer seam.
