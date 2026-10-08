# AGENTS.md — rules for Jules on Animator

You are the **implementer** on Animator, an MCP-first Lottie animation studio.
Claude Code is the **tech lead**: it writes your task briefs, reviews your PRs and merges them.
A human (the repo owner) sets priorities.

**Before any task, read `docs/PROJECT_CONTEXT.md`.** It holds the decisions (D1–D10), the Motion Doc
format (§7), the MCP tool design (§8) and the milestones (§15). If a task brief seems to conflict with
it, follow PROJECT_CONTEXT and say so in the PR description. Don't silently change a decision.

## Scope discipline (most important)

- **Do exactly the task in the brief.** One task = one branch = one PR. Don't start adjacent work.
- **Never open a second PR for the same task.** If you're asked to fix something, push to the same branch.
- Aim for **< 400 changed lines** excluding fixtures and the lockfile. If the task needs more, stop and
  say so in the PR instead of growing it.
- **No speculative infrastructure.** No Web Workers, SharedArrayBuffer, OffscreenCanvas, binary IPC,
  object pools, Electron, Turborepo, or "performance" layers unless a brief explicitly asks for them.
- **Every module you add has a caller and a test in the same PR.** No dead code "for later".

## Non-negotiables

1. **One model, one mutation path.** The Motion Doc is the project file. Every change goes through
   `applyOps()` in `packages/core`. No second store, no second `Keyframe` type, no second animation loop.
2. **One renderer.** Skottie via `canvaskit-wasm`, in Node and in the browser. Never write a Lottie renderer.
3. **`packages/core` is pure.** No fs, network, wasm, DOM or Node APIs in core.
4. **Lottie output is deterministic and schema-valid.** Same input → byte-identical output.
5. **Video never goes inside Lottie.** It lives on the video track and is composited at MP4/WebM export.
6. **Tests never call paid APIs.** Use the mock generation provider.
7. **Never commit build artifacts**: `dist/`, `*.tsbuildinfo`, `.turbo/`, `renders/`, `node_modules/`.
8. **Never edit the lockfile by hand.** Run `pnpm install` and commit the resulting `pnpm-lock.yaml`.

## Stack

Node 22 LTS · pnpm workspaces · TypeScript strict (`noUncheckedIndexedAccess`) · Zod v4 · Vitest · Biome ·
Immer · canvaskit-wasm · ffmpeg-static · `@modelcontextprotocol/server` (TS SDK v2) · Hono · React + Vite ·
opentype.js · `@fal-ai/client`. Don't add any other dependency without justifying it in the PR description.

Before using an SDK API you're unsure about (especially the MCP SDK v2), read its current docs
(`https://ts.sdk.modelcontextprotocol.io/v2/llms-full.txt`) instead of guessing.

## Commands (must pass before you open the PR)

```bash
pnpm install --frozen-lockfile
pnpm check        # typecheck + lint + test
pnpm build
```

If a command in the brief doesn't exist yet, the brief will tell you to create it.

## Layout

- `packages/core` — Motion Doc schema, ops, presets, easing, compiler → Lottie, linter
- `packages/render` — Skottie wrapper, frames, contact sheets, ffmpeg export, dotLottie
- `packages/gen` — provider interfaces, fal adapter, mock provider, cache, budget
- `apps/studio` — MCP server (HTTP + stdio), REST/WS API, jobs, file store, CLI
- `apps/editor` — web UI
- `fixtures/` golden docs · `templates/` starter docs · `docs/adr/` decisions · `docs/jules/` your task briefs

## Conventions

- IDs: kebab-case. Units in the Motion Doc: seconds, pixels, degrees, percent, hex colors.
  Frames exist only inside the compiler.
- Errors: throw `AnimatorError` with `code`, `path`, `hint`.
- Commits: Conventional Commits (`feat(core): add drawOn preset`).
- Branch name: the one given in the brief.

## Lottie gotchas

`op` is exclusive. Keyframe `o` handle goes on the start keyframe, `i` on the end keyframe. `tr` is last
in a shape group. A shape renders only with a fill/stroke in scope. Lottie layer order is top-first
(Motion Doc is bottom-first). canvaskit-wasm must be initialised once per process.

## PR description (required)

1. **What** changed and **why** (link the brief: `docs/jules/tasks/<id>.md`).
2. **How verified**: paste the output tail of `pnpm check` and `pnpm build`.
3. **Anything stubbed, skipped or failing** — at the top, in bold. Never claim done with red tests.
4. Screenshots or a contact sheet for anything that changes rendered output.
5. New dependencies and why.
