# M0-1 — Replace the legacy workspace with the new pnpm foundation

**Branch:** `m0/foundation` · **Milestone:** M0 (PROJECT_CONTEXT §15) · **Size:** small apart from deletions

Read `AGENTS.md` and `docs/PROJECT_CONTEXT.md` (§4 D10, §6, §13, §16) first.

## Goal

The repo still holds the abandoned Electron/PixiJS/Turborepo code. Replace it with empty, building shells
for the new architecture, and a CI that actually runs. The legacy code stays in git history
(tag `legacy-electron`); don't copy anything from it.

## Do

1. **Delete** everything legacy: `apps/editor`, `apps/perf-test`, `apps/runtime-player`,
   `packages/animation-engine`, `packages/math`, `packages/renderer`, `packages/scene-graph`,
   `packages/serialization`, `package-lock.json`, `turbo.json`, `tsconfig.base.json`, `readme`,
   `test-fractional.js`, and every file in `.github/workflows/`.
   Keep: `AGENTS.md`, `CLAUDE.md`, `docs/`, `scripts/`, `.gitignore` (rewrite it, see 5).
2. **Root**: `package.json` (`"private": true`, `"packageManager": "pnpm@<current 10.x>"`,
   `"engines": {"node": ">=22"}`), `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `.nvmrc` (`22`),
   `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
   `module`/`moduleResolution` `NodeNext`, `target` `ES2023`, `verbatimModuleSyntax`.
3. **Shell packages**, each with `package.json` (`"type": "module"`, name `@animator/<name>`),
   `tsconfig.json` extending the base, `src/index.ts`, and one trivial passing Vitest test:
   `packages/core`, `packages/render`, `packages/gen`, `apps/studio`, `apps/editor`.
   `apps/editor` is a minimal Vite + React app (`index.html`, `src/main.tsx` rendering "Animator editor").
4. **Tooling**: Biome (one root `biome.json`, formatter + linter on), Vitest (root `vitest.workspace.ts`
   or per-package config — your choice, say which). Root scripts:
   `typecheck` (tsc -b or per-package `tsc --noEmit`), `lint` (`biome check .`), `test` (`vitest run`),
   `build`, and `check` = typecheck + lint + test.
5. **`.gitignore`**: `node_modules/`, `dist/`, `*.tsbuildinfo`, `.turbo/`, `renders/`, `coverage/`, `.DS_Store`.
   Remove any already-committed artifacts from the index.
6. **CI**: `.github/workflows/ci.yml`, workflow `name: CI`, job `name: CI`, on `pull_request` and
   `push` to `main`. Steps: checkout, `pnpm/action-setup`, `actions/setup-node` (node 22, pnpm cache),
   `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`. Nothing else, no matrix.
7. Commit the generated `pnpm-lock.yaml`.

## Don't

- Don't add Turborepo, ESLint, Prettier, Jest, Electron or any runtime dependency beyond
  TypeScript, Biome, Vitest, Vite, React, `@vitejs/plugin-react`, `@types/*`.
- Don't implement any product code (Motion Doc, renderer, MCP). That's later tasks.
- Don't add other workflows (perf, e2e, auto-PR).

## Acceptance check (the reviewer will run exactly this)

```bash
git clean -xfd && pnpm install --frozen-lockfile && pnpm check && pnpm build
git ls-files | grep -E 'tsbuildinfo|/dist/|\.turbo|node_modules' && echo FAIL || echo OK
ls .github/workflows   # → ci.yml only
```

CI on the PR must be green. Paste the tail of `pnpm check` and `pnpm build` in the PR description.
