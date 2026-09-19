# Vendor reference trees (GPL-3.0)

This directory holds **reference-only** clones of:

| Path | Upstream | Role |
|------|----------|------|
| `OpenOutreach/` | [OpenOutreach](https://github.com/OpenOutreach/OpenOutreach) | Product shell / wizard concepts |
| `OpenOutFind/` | OpenOutFind | Qualify-with-reason patterns (Lead Finder was BetterContact — **not used in apsurn**) |
| `OpenOutSend/` | OpenOutSend | Draft / delivery guards / send-pass |

All three are licensed under **GPL-3.0**.

## Rules for this repo

- **Do not import or execute** Python from these trees in apsurn runtime, builds, or tests.
- Product behavior is **re-implemented in TypeScript** under `src/lib/`.
- Default prospecting is **free/OSS**: Vertex grounded search + public crawl + email patterns + Vertex fit/reason (`src/lib/prospecting/sources/openoutreach.ts`). BetterContact is left out (paid).
- Keep these clones for audit and behavioral comparison only.

If you remove or update a tree, re-clone shallowly and leave this README intact.
