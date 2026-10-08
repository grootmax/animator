# Jules workspace goals — Animator

Long-term goals for the Jules workspace on `grootmax/animator`, in priority order. Each goal has a
measurable target so Jules can generate insights against it. Source of truth for the plan:
`docs/PROJECT_CONTEXT.md`; task queue: `docs/jules/BACKLOG.md`.

| P | Goal | Target (measurable) | Due |
|---|---|---|---|
| P0 | **Green, trustworthy main** | Every PR runs one `CI` workflow (`pnpm install --frozen-lockfile && pnpm check && pnpm build`); `main` stays green; 0 build artifacts tracked; 0 open PRs that duplicate another or revive legacy branches | ongoing (from Oct 8) |
| P0 | **Foundation (M0)** | pnpm workspace with core/render/gen/studio/editor; a test renders a Lottie frame to PNG via canvaskit-wasm Skottie | Oct 8 |
| P1 | **Motion Doc core (M1)** | Zod schema, atomic `applyOps` with undo patches, compiler → Lottie that is deterministic and schema-valid; presets v1; 10 golden fixtures match reference frames; every §7.5 compiler rule has a test | Oct 11 |
| P1 | **Agent-first MCP server (M2)** | Studio on :4747 with Streamable HTTP `/mcp` + stdio; 9 tools with output schemas and contract tests; an agent makes a 3 s logo reveal and exports a valid `.lottie` in ≤ 8 tool calls | Oct 13 |
| P2 | **Live editor (M3, minimal)** | Skottie player, layer list, live WebSocket updates < 200 ms after an agent edit; edits go through ops only | Oct 15 |
| P2 | **Text, SVG and AI generation (M4)** | Outlined text, SVG → shape layers, `generate_image` (raster/vector/transparent) via fal behind a provider adapter, cache + per-project budget; tests use the mock provider only | after Oct 15 |
| P3 | **Video export (M5)** | MP4/WebM/GIF/PNG-seq export; 4 s 1080p MP4 in < 10 s; generated video composited on the video track, never inside Lottie | after M4 |
| P3 | **Ship (M6)** | `npx animator dev` + `claude mcp add` works on a fresh machine in < 2 min; inline MCP App player; templates; weekly agent eval of 10 prompts | after M5 |

## Standing quality goals (always on)

- **Simplicity:** one data model, one mutation path, one renderer; flag any second store, keyframe type,
  animation loop or renderer as a regression.
- **Every module has a caller and a test.** Flag dead code and unwired validators.
- **Small PRs:** < 400 changed lines excluding fixtures/lockfile; one task per PR.
- **Determinism:** the same Motion Doc compiles to byte-identical Lottie.
- **Security:** studio binds to 127.0.0.1; Origin checks on HTTP/WS; SVG imports sanitized; API keys only from env.

## Out of scope (don't propose)

Electron, Web Workers, SharedArrayBuffer/OffscreenCanvas, binary IPC, object pools, Turborepo,
a custom Lottie renderer, expressions/3D, accounts or cloud hosting.
