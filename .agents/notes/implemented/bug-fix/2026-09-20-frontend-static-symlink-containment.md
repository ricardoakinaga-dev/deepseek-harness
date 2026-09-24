# Agent Note: Frontend static resolved-target containment

Status: implemented

English | [中文](2026-09-20-frontend-static-symlink-containment.zh.md)

## Problem

`@deepseek-ai/dsh-host-frontend-static` checked the lexical path produced by joining the request pathname to the configured distribution root, then read that path. A symlink or Windows junction inside the distribution could therefore resolve outside the root after the lexical check and expose external bytes.

The package README promised that served files came from the configured distribution root, but the real-composition test did not cover resolved symlink targets.

## Decision

`serveStatic` retains the lexical traversal check and canonicalizes the distribution root and requested target with `fs.realpath` before classifying or reading the request. It compares canonical paths with a platform-separator-aware containment predicate and reads the canonical in-root target instead of the link-shaped request path. A missing target uses the canonical deepest existing ancestor with its missing suffix restored. The configured index is checked by the same rule before its HTML is read, including for a root request whose target is the distribution directory.

The real Loader composition fixture covers an in-root directory alias, an outside directory symlink, a Windows directory-junction equivalent, an outside missing child, and a link to the distribution parent. Outside targets return 403 without outside bytes. Existing traversal, 404, 405, MIME, authentication, and fallback-disposal behavior remains covered.

The change is an `upstream-package-change`: frontend-static owns the fallback handler and no public plugin or webserver event can replace its filesystem target decision without duplicating the official owner. The implementation follows the repository's [canonical filesystem containment precedent](../feature/2026-07-14-cross-family-fs-sandbox.md).

## Alternatives considered

**Keep lexical containment only.** Rejected because the direct reproduction served 200 with bytes from a directory symlink outside the distribution root.

**Reject every symlink or junction.** Rejected because an in-root alias is a valid distribution layout, and the required rule is resolved-target containment rather than link-type rejection.

**Use a platform-specific kernel primitive.** Deferred because `openat2` and Windows handle resolution do not provide one portable implementation for this package's supported hosts. The application-level check is appropriate for trusted-host build inputs, but it is not a kernel-grade guarantee against a concurrent filesystem attacker.

## Consequences

Canonicalization adds filesystem work to every static request and can observe a build tree while it changes. Missing or changing targets fail closed without converting unrelated filesystem failures into success. Reading the canonical target narrows the portable resolve-to-read race; a deployment requiring kernel-grade isolation must provide a platform-specific serving primitive instead of treating this package as that boundary.

## Testing

The focused real-composition test passes with 100% statements, branches, functions, and lines for `src/index.ts`. The package README and bilingual sidecar describe resolved-target containment and the application-level threat model. The customization policy records the change as an active upstream package patch.
