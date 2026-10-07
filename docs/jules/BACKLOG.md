# Jules backlog

The single prioritized queue. Maintained by the tech lead (Claude Code). One brief per task in
`docs/jules/tasks/`. A task is dispatched only when everything it depends on is merged.

Status: `ready` (brief written) · `queued` (needs a brief) · `in-flight` (Jules session open) ·
`review` (PR open) · `merged` · `dropped`

## Now — M0 Foundation

| ID | Task | Depends on | Status | Session / PR |
|---|---|---|---|---|
| M0-1 | Replace legacy workspace with pnpm foundation + working CI | — | ready | |
| M0-2 | Headless Skottie render test in `packages/render` | M0-1 | ready | |
| M0-3 | Tech lead: protect `main` (require PR + `CI` check, block force-push) | M0-1 | queued (Claude) | |

## Next — M1 Core (briefs written after M0 merges; slices can run in parallel where marked)

| ID | Task | Depends on |
|---|---|---|
| M1-1 | Motion Doc Zod schema + types (§7.1–7.3), `AnimatorError`, `newId` | M0-1 |
| M1-2 | Ops reducer `applyOps` with Immer patches, atomic batches, inverse patches (§7.6) | M1-1 |
| M1-3 | Compiler skeleton: canvas → Lottie top level, static transforms, layer order/`ind` (§7.5) + vendored Lottie schema + Ajv | M1-1 |
| M1-4 | Compiler: shape layers (rect/ellipse/path), fill/stroke, `tr` last | M1-3 |
| M1-5 | Compiler: keyframes, easing → bezier handles, scalar wrapping, same-frame rejection | M1-3 (parallel with M1-4) |
| M1-6 | Compiler: image + group (precomp) layers, params → slots | M1-4 |
| M1-7 | Presets v1 entrances/exits + overlap validation | M1-5 |
| M1-8 | Presets v1 emphasis + stagger | M1-7 |
| M1-9 | Linter rules + `lottie:validate` script | M1-6 |
| M1-10 | 10 golden fixtures, contact sheets, pixel-diff tests, `render:fixture` contact-sheet mode | M1-8, M1-9, M0-2 |

## Later

M2 MCP v1 → M3 Editor → M4 Text/SVG/generation → M5 Video → M6 Ship (PROJECT_CONTEXT §15).

## Log

- 2026-10-07 — Backlog triage: auto-merge workflow disabled; #108 and #138 merged after review;
  119 PRs closed (rejected, duplicate, empty or conflicted). See ADR 0001.
