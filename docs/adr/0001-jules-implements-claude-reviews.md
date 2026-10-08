# ADR 0001 — Jules implements, Claude Code reviews and merges, build in grootmax/animator

- Status: accepted
- Date: 2026-10-07
- Decided by: repo owner

## Context

`KICKOFF.md` planned a fresh empty repo with Claude Code as both tech lead and implementer, and
CLAUDE.md rule 8 said a human merges every PR.

The owner already has a Jules workspace connected to `grootmax/animator` and wants Jules to do the
implementation, with Claude Code acting as tech lead. The old backlog in this repo (121 Jules PRs,
an auto-merge bot) was cleaned up on 2026-10-07:

- Auto Jules PR Manager workflow disabled.
- #108 and #138 reviewed, trial-merged, typechecked (no new errors) and squash-merged.
- #114, #118, #130 closed after review (dead code / second keyframe model / missing store API).
- #115 closed as a duplicate of #138; #47, #105, #120, #127, #141 closed (empty diffs).
- 110 conflicted PRs closed with a comment; their branches are kept.

## Decision

1. **Build in `grootmax/animator`.** M0 replaces the legacy Electron/PixiJS workspace with the layout
   in PROJECT_CONTEXT §6. The legacy code stays in git history (branch `legacy-electron`, created 2026-10-07 at 4404fa5).
2. **Jules is the implementer.** Claude Code writes one brief per task in `docs/jules/tasks/`,
   dispatches it as a GitHub issue labelled `jules` (the Jules MCP server or CLI on the owner's
   machine are equivalent alternatives), and
   keeps `docs/jules/BACKLOG.md` as the single prioritized queue.
3. **Claude Code reviews and merges Jules PRs** — after CI is green and the PR meets the brief's
   acceptance check. This replaces CLAUDE.md rule 8 for Jules-authored PRs only.
4. **Still forbidden:** auto-merge bots, merging on red CI, force-pushing `main`, and Claude Code
   merging a PR that Claude Code itself authored (the owner merges those).
5. **One task in flight per area.** Parallel Jules sessions only for tasks that touch disjoint
   packages; never `--parallel N` on the same brief.

## Consequences

- `AGENTS.md` carries the implementer rules Jules sees on every task.
- The review loop is: brief → Jules session → PR → CI → Claude review (request changes on the same
  branch, or merge) → backlog update.
- Throughput is bounded by review, by design. That is what prevents the 121-PR pile-up from recurring.
