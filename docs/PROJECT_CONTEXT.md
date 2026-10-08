# Animator — Project Context

> The single source of truth for what we are building, why, and how.
> Claude Code (tech lead) and Jules (implementer) read this before planning or building any milestone.
> Last updated: 2026-10-07 · Status: pre-build · Workflow: see `docs/adr/0001-jules-implements-claude-reviews.md`

---

## 1. One-liner

**An MCP-first Lottie animation studio.** An AI agent (Claude Code, Claude Desktop, any MCP client) connects to it and can create, edit, preview and export professional Lottie animations — with AI-generated images, vector art and video — in a few tool calls. A lightweight web editor shows the same project live, so a human can watch, tweak and take over.

## 2. Goals and non-goals

### Goals (v1)
1. **Agent-first.** An agent with no prior knowledge can go from a prompt to an exported animation in under 10 tool calls, and can *see* its own result (rendered frames returned as images).
2. **Lottie as the output.** Every project compiles to valid Lottie JSON (`.json`) and dotLottie (`.lottie`) that plays in standard players (lottie-web, dotlottie-web/ThorVG, Skottie, iOS/Android).
3. **Generation built in.** Image generation (raster and vector), background removal, and video generation are first-class tools, behind a provider adapter.
4. **Video export.** MP4, WebM (with alpha), GIF and PNG sequence — including AI-generated video clips composited under or over the Lottie layers.
5. **Fast and simple.** Small codebase, one data model, one mutation path, one renderer. Ship a usable MCP server in week 1.

### Non-goals (v1)
- Not After Effects. No expressions, no 3D, no particle systems, no node graphs.
- No custom rendering engine. We never draw Lottie ourselves; Skottie does.
- No Electron/desktop app. Local web app first; a desktop wrapper (Tauri) can come later.
- No multi-user real-time collaboration, accounts, billing or cloud hosting.
- No in-app chat UI. The agent lives in the MCP client; the editor is for viewing and manual tweaks.

## 3. Users and core flows

| Actor | Flow |
|---|---|
| **Agent via MCP** (primary) | `create_project` → `edit_project` (batched ops) → `validate_project` → `render_preview` (looks at frames) → fix → `export_project` |
| **Human in the editor** | Opens `http://localhost:4747`, sees the agent's project update live, scrubs the timeline, selects a layer, tweaks color/text/timing, exports |
| **Both together** | Human says "make the title bigger" in Claude Code; agent edits; editor updates instantly; human nudges timing by hand; agent sees the new revision on its next `get_project` |

Typical requests the product must handle well: logo reveal, kinetic title, lower third, loader/icon, UI micro-interaction, data/stat callout, product promo with a generated hero image, social clip with a generated video background.

## 4. Key decisions

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| D1 | **Our own high-level document format ("Motion Doc") is the project file; Lottie is a compiled output.** | Raw Lottie (`ty`, `ks`, bezier `i/o` handles, frame numbers) is hostile to agents and humans. A small, readable DSL in seconds/pixels/hex colors is easy to author, diff and validate. Compilation is deterministic and testable. | Editing Lottie JSON directly (agents make structural mistakes constantly; no room for presets). |
| D2 | **All edits go through one ops reducer** (`applyOps(doc, ops)`), shared by MCP, editor and CLI. Implemented with Immer patches. | Undo/redo, live sync, audit log and atomic batches for free. Prevents the "two models drift apart" failure of the previous repo. | Separate store per surface. |
| D3 | **One renderer everywhere: Skottie via `canvaskit-wasm`** — in Node for previews/exports and in the browser editor. | What the agent sees = what the human sees = what gets exported. Verified in a spike: headless Node render of a Lottie frame to PNG works (~10 ms/frame for a simple scene). | lottie-web in Playwright (heavy, slow); different renderers per surface (silent mismatches). |
| D4 | **Server is the source of truth.** One Node process ("studio") hosts the MCP endpoint, a JSON/WS API for the editor, the renderer, the job queue and file storage. | Simple mental model; MCP 2026-07-28 core is stateless, so all state lives in project files, never in a session. | Editor-owned state with MCP talking to the browser. |
| D5 | **Local-first, files on disk.** A project is a folder (`doc.json`, `assets/`, `renders/`, `history.jsonl`). | Git-friendly, inspectable, zero infra. | Database. |
| D6 | **Text compiles to vector outlines by default** (opentype.js + bundled fonts). Native Lottie text is opt-in. | Outlined text renders identically in every Lottie player; native text needs fonts present on each player. | Native text only. |
| D7 | **Video is never inside Lottie.** Lottie has no video layer. Video clips (uploaded or generated) live on a separate *video track* and are composited with ffmpeg at MP4/WebM export. Lottie/dotLottie exports warn that video tracks are dropped (or offer a poster frame / image-sequence fallback). | Honest about the format's limits; keeps Lottie output valid. | Hacking video into image sequences inside Lottie (huge files). |
| D8 | **Generation behind a provider adapter; fal.ai first.** Model IDs live in config, not code. | One API key covers many image/video models; models change monthly. | Hard-coding one vendor's SDK through the codebase. |
| D9 | **Presets over hand-written keyframes.** A preset library (fadeIn, slideUp, pop, drawOn, stagger…) with tasteful default easing. Raw keyframes remain available. | Agents produce professional motion without inventing bezier handles. | Keyframes only. |
| D10 | **TypeScript everywhere, pnpm workspaces, Vitest, Biome, Zod v4.** No Turborepo until build times demand it. | Fewest moving parts; Zod is shared with the MCP SDK for tool schemas. | Turbo + ESLint + Prettier + Jest from day one. |

Record any change to these as an ADR in `docs/adr/NNNN-title.md`.

## 5. Architecture

```
            ┌──────────────── MCP clients ────────────────┐
            │ Claude Code · Claude Desktop · other agents │
            └───────────┬───────────────────────┬─────────┘
                 stdio shim                Streamable HTTP
                        │                       │  /mcp
┌───────────────────────▼───────────────────────▼──────────────────────┐
│ apps/studio  (one Node process, default port 4747)                    │
│                                                                       │
│  mcp/        tools · resources · prompts · MCP App (ui://) · tasks    │
│  api/        REST + WebSocket for the editor (Hono)                   │
│  jobs/       in-process queue for renders, exports, generation        │
│  store/      project folders on disk, revisions, history.jsonl        │
│      │              │                    │                            │
│      ▼              ▼                    ▼                            │
│ packages/core   packages/render     packages/gen                      │
│ Motion Doc,     Skottie (canvaskit) image/video/vector adapters       │
│ ops, presets,   frames → PNG,       (fal first), cache, cost guard     │
│ compiler →      contact sheets,                                       │
│ Lottie, lint    ffmpeg exports                                        │
└───────────────────────────────▲───────────────────────────────────────┘
                                │ WebSocket (ops in, revisions out)
                       ┌────────┴────────┐
                       │ apps/editor     │  Vite + React, Skottie player,
                       │ (browser)       │  timeline, layers, inspector
                       └─────────────────┘
```

**Rule:** `packages/core` is pure (no I/O, no Node or DOM APIs). Everything that touches disk, network, wasm or ffmpeg lives outside it.

## 6. Repository layout

```
animator/
├─ AGENTS.md                     # rules for Jules (implementer)
├─ CLAUDE.md                     # tech-lead operating rules (short)
├─ docs/
│  ├─ PROJECT_CONTEXT.md         # this file
│  ├─ adr/                       # architecture decision records
│  ├─ jules/                     # Jules task backlog and task briefs
│  └─ motion-doc.md              # DSL reference (also served as an MCP resource)
├─ packages/
│  ├─ core/        # Motion Doc types + Zod schemas, ops reducer, presets, easing,
│  │               # compiler (Motion Doc → Lottie), linter, SVG→shapes, text→outlines
│  ├─ render/      # canvaskit-wasm Skottie wrapper (Node + browser), frame render,
│  │               # contact sheet, ffmpeg export (mp4/webm/gif/png-seq), dotLottie pack
│  └─ gen/         # provider interface, fal adapter, cache, cost guard
├─ apps/
│  ├─ studio/      # server: MCP (http + stdio shim), REST/WS API, jobs, file store, CLI
│  └─ editor/      # web UI
├─ fixtures/       # golden Motion Docs → expected Lottie + reference frames
├─ templates/      # starter Motion Docs (title card, logo reveal, lower third, loader…)
└─ .claude/        # agents, hooks, settings for Claude Code
```

## 7. The Motion Doc (project format)

Human- and agent-friendly. Units: **seconds**, **pixels** (origin top-left), **hex colors**, **degrees**, **percent for scale/opacity**.

### 7.1 Example

```json
{
  "version": 1,
  "name": "Launch title",
  "canvas": { "width": 1080, "height": 1080, "fps": 30, "duration": 4, "background": "#0B1020" },
  "params": {
    "accent": { "type": "color", "value": "#FF5A5F", "label": "Accent" },
    "headline": { "type": "text", "value": "Ship faster", "label": "Headline" }
  },
  "assets": [
    { "id": "hero", "type": "image", "src": "assets/hero.png", "width": 1024, "height": 1024, "origin": { "kind": "generated", "provider": "fal", "model": "…", "prompt": "…" } },
    { "id": "bg-video", "type": "video", "src": "assets/bg.mp4", "width": 1080, "height": 1080, "durationSec": 6 }
  ],
  "layers": [
    {
      "id": "bg-image", "type": "image", "asset": "hero",
      "position": [540, 540], "size": [1080, 1080], "opacity": 60,
      "presets": [{ "name": "kenBurns", "at": 0, "duration": 4, "params": { "zoom": 1.08 } }]
    },
    {
      "id": "title", "type": "text",
      "text": "{{headline}}", "font": { "family": "Inter", "weight": 800, "size": 120 },
      "fill": "{{accent}}", "align": "center", "position": [540, 480],
      "presets": [
        { "name": "fadeIn",  "at": 0.2, "duration": 0.5 },
        { "name": "slideUp", "at": 0.2, "duration": 0.6, "params": { "distance": 60 } },
        { "name": "fadeOut", "at": 3.4, "duration": 0.4 }
      ]
    },
    {
      "id": "underline", "type": "shape",
      "position": [540, 580],
      "shape": { "kind": "path", "d": "M -200 0 L 200 0" },
      "stroke": { "color": "{{accent}}", "width": 8, "cap": "round" },
      "presets": [{ "name": "drawOn", "at": 0.6, "duration": 0.7, "params": { "ease": "easeOutExpo" } }]
    },
    {
      "id": "badge", "type": "group", "position": [540, 760],
      "children": [
        { "id": "pill", "type": "shape", "shape": { "kind": "rect", "size": [260, 72], "radius": 36 }, "fill": "#FFFFFF" },
        { "id": "pill-label", "type": "text", "text": "v2.0", "font": { "family": "Inter", "weight": 600, "size": 36 }, "fill": "#0B1020" }
      ],
      "keyframes": {
        "scale": [ { "t": 0.9, "v": [0, 0] }, { "t": 1.3, "v": [100, 100], "ease": "easeOutBack" } ]
      }
    }
  ],
  "videoTrack": [
    { "id": "clip1", "asset": "bg-video", "at": 0, "trimIn": 0, "duration": 4, "placement": "under" }
  ]
}
```

### 7.2 Layer types (v1)

| type | Key fields | Compiles to |
|---|---|---|
| `shape` | `shape.kind`: `rect` (size, radius), `ellipse` (size), `path` (SVG `d`), `polygon`/`star` (points, radii); `fill`, `stroke`, `gradient` | Shape layer (`ty:4`) with `gr` group, `rc`/`el`/`sh`/`sr`, `fl`/`st`/`gf`, `tr` last |
| `text` | `text`, `font {family, weight, size}`, `fill`, `align`, `lineHeight`, `maxWidth`, `native?` | Outlined: shape layer of glyph paths. `native:true`: text layer (`ty:5`) + fonts list |
| `image` | `asset`, `size`, `fit` | Image layer (`ty:2`) + image asset (embedded base64 in dotLottie/JSON export) |
| `group` | `children`, transform | Precomp layer (`ty:0`) so opacity and masks apply to the whole group |
| `lottie` | `asset` (imported Lottie), transform, `timeOffset`, `speed` | Precomp of the imported animation (opaque but transformable) |

Shape geometry (paths, rects, ellipses) is in **layer space**, centred on the layer's `position` unless `anchor` says otherwise.

Common to all: `id` (stable, kebab-case, unique), `name?`, `position`, `anchor` (default `center` of own bounds), `scale` [x,y] %, `rotation` deg, `opacity` %, `visible`, `blend?`, `in`/`out` (seconds visible), `parent?`, `mask?`/`matte?` (v1.1), `keyframes {prop: Keyframe[]}`, `presets: PresetRef[]`.

### 7.3 Animation

- **Keyframe**: `{ t: seconds, v: value, ease?: EaseName | [x1,y1,x2,y2] | "hold" }`. `ease` describes the segment *leaving* this keyframe.
- **Animatable props (v1)**: `position`, `scale`, `rotation`, `opacity`, `anchor`, `fill`, `stroke.color`, `stroke.width`, `trim.start`/`trim.end`/`trim.offset`, `shape.size`, `shape.radius`, `shape.d` (morph only between paths with identical command structure — linter enforces).
- **Presets** expand into keyframes at compile time. Each preset declares the props it touches. Two presets may touch the same prop only if their time ranges do not overlap (e.g. `fadeIn` at 0 and `fadeOut` at 3). Overlap → validation error with a fix suggestion.
- **Stagger**: `{ "name": "stagger", "targets": ["a","b","c"], "preset": "slideUp", "at": 0.3, "step": 0.08 }` at doc level.
- **Easing names**: `linear`, `easeIn/Out/InOut` × `Sine/Quad/Cubic/Quart/Expo/Back`, `spring` (baked to keyframes), `hold`.
- **Params** (`{{name}}`) compile to Lottie **slots** (`sid`) so colors and text stay themeable in the exported file.

### 7.4 Preset library v1

Entrances: `fadeIn`, `slideUp/Down/Left/Right`, `pop` (scale with overshoot), `growX/growY`, `drawOn` (trim path 0→100), `typeOn` (per-glyph reveal; outlined text only), `maskReveal`.
Exits: mirrors of the above (`fadeOut`, `slideOutUp`, …).
Emphasis: `pulse`, `shake`, `wiggle` (baked), `bounce`, `spin`, `float` (loopable), `colorShift`.
Camera/scene: `kenBurns`, `pan`, `zoomTo`.
UI/loaders: `spinner`, `dotsLoader`, `progressBar`, `checkmark`, `errorX`.

Taste defaults baked into presets: entrances 0.3–0.6 s with `easeOutCubic`/`easeOutExpo`; exits ~70% of entrance duration with `easeInCubic`; stagger 0.06–0.1 s; no `linear` except loops/spinners; overshoot only on small focal elements.

### 7.5 Compiler rules (Motion Doc → Lottie)

Encode these as unit tests; they are the classic Lottie pitfalls:
- Top level must include `v`, `fr`, `ip`, `op`, `w`, `h`, `nm`, `assets`, `layers`. `op` is **exclusive**: `op = round(duration × fps)`.
- Times: `frame = round(t × fps)`; reject two keyframes on the same frame for one prop.
- Static props `{a:0,k:v}`; animated `{a:1,k:[…]}`; keyframes sorted by `t`; scalar values wrapped in arrays (`s:[45]`).
- A cubic-bezier `[x1,y1,x2,y2]` maps to `o:{x:[x1],y:[y1]}` on the start keyframe and `i:{x:[x2],y:[y2]}` on the end keyframe. `x` ∈ [0,1]; `y` may overshoot.
- Colors: hex → RGBA floats 0–1. Opacity 0–100.
- In shape groups the `tr` transform is **last**; a shape needs a preceding fill or stroke in scope to render.
- Lottie layer order is top-first; Motion Doc `layers[0]` is the **bottom** (painter's order, like SVG). The compiler reverses.
- Layer `ind` assigned deterministically; `parent` references by `ind`; reject cycles.
- Output is deterministic: same Motion Doc → byte-identical Lottie (stable key order, fixed float precision of 3 decimals).
- Validate output against the Lottie JSON schema from the Lottie Animation Community spec (vendored, checked with Ajv) in tests and in `validate_project`.

### 7.6 Ops (the only way to mutate a project)

```ts
type Op =
  | { op: "setCanvas"; set: Partial<Canvas> }
  | { op: "addLayer"; layer: Layer; parent?: string; index?: number }
  | { op: "updateLayer"; id: string; set: DeepPartial<Layer> }          // deep merge
  | { op: "removeLayer"; id: string }
  | { op: "moveLayer"; id: string; parent?: string | null; index: number }
  | { op: "setKeyframes"; id: string; prop: AnimProp; keyframes: Keyframe[] | null }
  | { op: "addPreset"; id: string; preset: PresetRef }
  | { op: "removePreset"; id: string; index: number }
  | { op: "addStagger"; stagger: Stagger }
  | { op: "setParam"; name: string; param: Param | null }
  | { op: "addAsset"; asset: Asset } | { op: "removeAsset"; id: string }
  | { op: "setVideoTrack"; clips: VideoClip[] };
```

- `applyOps(doc, ops)` is **atomic**: all ops validate or none apply. Returns `{ doc, revision, changedIds, inversePatches, warnings }`.
- Every successful batch appends one line to `history.jsonl` (`{revision, source: "mcp"|"editor"|"cli", ops, at}`) and stores inverse patches for undo.
- Editors and agents send ops with `baseRevision`; if stale, the server rebases when the touched ids don't overlap, otherwise returns a conflict with the current revision.

## 8. MCP server design (the product's main surface)

### 8.1 Principles
1. **Few, high-level tools** (≈12). Each tool does one meaningful job.
2. **Batch everything.** `edit_project` takes many ops in one call.
3. **Let the agent see.** `render_preview` returns PNG image content (contact sheets of key frames) so the model can check its own work. The server instructions tell the agent to preview before exporting.
4. **Token-lean outputs.** `get_project` defaults to a compact outline (one line per layer); full JSON only on request. Previews default to 512 px.
5. **Actionable errors.** Every error says what was wrong, where (`layers[3].presets[1]`), valid values, and a corrected example.
6. **Deterministic and idempotent** where possible; ids are chosen by the agent (or auto-generated and returned).
7. **Stateless per request** (MCP 2026-07-28 core): every call carries `projectId`; nothing lives in session memory.
8. **Long work is a task.** Video generation and video export use the MCP **Tasks** extension when the client supports it; otherwise return a `jobId` and offer `get_job` for polling.
9. **Costs are explicit.** Generation tools show estimated cost, respect a per-project budget, and cache by `(provider, model, prompt, params)` hash.
10. Tool input schemas are strict **JSON Schema 2020-12** (generated from Zod); annotate tools with `readOnlyHint`/`destructiveHint`/`idempotentHint` and give each an `outputSchema` plus `structuredContent`.

### 8.2 Tools (v1)

| Tool | Input (essentials) | Returns |
|---|---|---|
| `create_project` | `name`, `width`, `height`, `fps`, `duration`, `background?`, `template?` | `projectId`, outline, editor URL |
| `list_projects` | — | ids, names, updated times |
| `get_project` | `projectId`, `detail: "outline"\|"full"\|"lottie"` | outline text or JSON, `revision` |
| `edit_project` | `projectId`, `ops[]`, `baseRevision?`, `dryRun?` | `revision`, `changedIds`, warnings, compact diff |
| `undo` | `projectId`, `steps?` | `revision`, outline |
| `validate_project` | `projectId` | errors and warnings: schema, Lottie-schema, overlap, off-canvas, text overflow, invisible layers, too-fast motion, missing assets |
| `render_preview` | `projectId`, `times?` (seconds) or `count?`, `layout: "contact_sheet"\|"frames"\|"gif"`, `size?` | image content (PNG/GIF) + frame times |
| `list_presets` | `category?` | names, params, defaults, one-line examples |
| `import_asset` | `projectId`, `source {url\|path\|base64}`, `kind: image\|svg\|lottie\|video\|font`, `asLayer?` | `assetId` (+ `layerId`); SVG can become editable shape layers |
| `generate_image` | `projectId`, `prompt`, `style: photo\|illustration\|vector\|icon`, `size`, `transparent?`, `asLayer?`, `confirmCost?` | `assetId`, thumbnail image, cost. `vector` returns SVG → animatable shapes |
| `generate_video` | `projectId`, `prompt`, `fromImage?`, `duration`, `aspect`, `confirmCost?` | task / `jobId` → video asset on the video track |
| `export_project` | `projectId`, `format: lottie\|dotlottie\|mp4\|webm\|gif\|png_sequence`, `quality?`, `scale?` | file path + editor download URL (task for video formats) |
| `get_job` | `jobId` | status, progress, result |

**Resources:** `animator://docs/motion-doc` (DSL guide with examples), `animator://presets`, `animator://templates`, `animator://projects/{id}` (Motion Doc), `animator://projects/{id}/lottie` (compiled Lottie).
**Prompts:** `logo_reveal`, `kinetic_title`, `lower_third`, `product_promo`, `loader_icon` — each a storyboard-first recipe that ends with preview → export.
**MCP App (v1.1):** a `ui://animator/player` resource (`text/html;profile=mcp-app`) linked from `render_preview`/`export_project`, so hosts that support MCP Apps show an interactive Skottie player with a scrubber inline in the chat.
**Transports:** Streamable HTTP at `http://localhost:4747/mcp` (primary) and a stdio entry (`animator mcp`) that proxies to a running studio or starts one in-process.

### 8.3 Server instructions (sent to the agent)

> Plan the animation as a short storyboard (beats with times) before editing. Create the project, then apply ops in batches of related changes. Prefer presets over raw keyframes. After each major batch, call `validate_project`, then `render_preview` with a contact sheet and look at it: check composition, legibility, timing and that nothing is cropped. Fix issues before exporting. Generation costs money: confirm with the user before `generate_video`. Read `animator://docs/motion-doc` once if unsure about the format.

### 8.4 Example agent session (target: ≤ 8 calls)

1. `create_project {name:"Launch", width:1080, height:1080, fps:30, duration:4, background:"#0B1020"}`
2. `generate_image {prompt:"isometric rocket, soft gradient, clean vector", style:"vector", asLayer:true}`
3. `edit_project {ops:[addLayer title…, addPreset fadeIn/slideUp…, addStagger…]}`
4. `validate_project` → 1 warning: title overflows at 1080 px
5. `edit_project {ops:[updateLayer title {font:{size:96}}]}`
6. `render_preview {layout:"contact_sheet", count:6}` → agent inspects image
7. `export_project {format:"dotlottie"}` and `export_project {format:"mp4"}`

### 8.5 Client setup

```bash
# Primary: run the studio, connect over HTTP
npx animator dev                      # starts studio on :4747 and prints the editor URL
claude mcp add --transport http animator http://localhost:4747/mcp

# Alternative: stdio
claude mcp add animator -- npx -y animator mcp
```

Commit a `.mcp.json` in the repo so Claude Code picks the server up in this project.

## 9. Generation

```ts
interface ImageProvider {
  generate(req: { prompt: string; style: Style; width: number; height: number; transparent?: boolean; seed?: number })
    : Promise<{ bytes: Uint8Array; mime: string; model: string; costUsd?: number }>;
}
interface VectorProvider { generateSvg(req: {...}): Promise<{ svg: string; model: string; costUsd?: number }>; }
interface VideoProvider {
  submit(req: { prompt: string; image?: Uint8Array; durationSec: number; aspect: string }): Promise<{ jobId: string }>;
  poll(jobId: string): Promise<{ status: "queued"|"running"|"done"|"failed"; progress?: number; bytes?: Uint8Array }>;
}
interface BackgroundRemover { removeBackground(img: Uint8Array): Promise<Uint8Array>; }
```

- **First adapter: fal.ai** (`@fal-ai/client`): queue-based submit/poll, one key for many image/video models. Keep model ids in `animator.config.json` (e.g. an image model, a vector-capable model, a background-removal model, a text-to-video and an image-to-video model). Check fal's model catalog when implementing; ids change often.
- **Vector generation is the high-value path for Lottie:** SVG output → `svgToShapes()` → real shape layers the agent can animate (drawOn, stagger per path). Raster images are fine for backgrounds and hero art.
- **Mock provider** with deterministic fixtures for tests and offline dev; tests never call paid APIs.
- **Cache** results under `~/.animator/cache/` keyed by request hash; **budget** per project (default $2) with a clear error when exceeded; record provenance (`origin`) on every generated asset.
- API keys from env (`FAL_KEY`), never written into project files.

## 10. Rendering and export

- `packages/render` wraps `canvaskit-wasm` (full build with Skottie): `MakeManagedAnimation(json, assets)` → `seekFrame(f)` → `render(canvas, rect)` → `encodeToBytes()`. Fonts and image bytes are passed as assets.
- **Preview**: render selected frames; compose a labeled contact sheet (frame time under each tile) as one PNG.
- **Video export**: render frames in-process → pipe raw RGBA to `ffmpeg` (`ffmpeg-static`) → H.264 MP4 (yuv420p), VP9 WebM with alpha, GIF via palettegen/paletteuse, or PNG sequence. Video-track clips are composited with ffmpeg overlay filters (`under` = Lottie over video; `over` = video over Lottie).
- **dotLottie**: package JSON + images + fonts with `@lottiefiles/dotlottie-js`; include theme data derived from params where useful.
- **Lottie JSON**: images embedded as base64 data URIs (option: external files).
- Performance budget: 1080×1080, 30 fps, 4 s simple scene exports to MP4 in under 10 s on a laptop.

## 11. Editor (apps/editor) — v1 scope

- Skottie canvas player (canvaskit in the browser) with play/pause, loop, frame scrubber, fps/time readout, checkerboard for transparency.
- Layer list (tree, visibility/lock toggles, drag reorder → `moveLayer` op).
- Inspector for the selected layer: transform, fill/stroke, text, presets list (edit timing/params), keyframe list.
- Timeline: one row per layer showing `in/out` bars and preset blocks; drag to retime (emits ops).
- Params panel (theme colors/text).
- Assets panel (upload, generated assets with provenance).
- Export dialog.
- Live: subscribes over WebSocket; shows "Agent edited 3 layers" toasts; highlights changed layers.
- Not in v1: on-canvas transform handles, pen tool, keyframe bezier editor. (Add on-canvas move/scale handles in v1.1.)

## 12. Storage

```
~/Animator/projects/<projectId>/
  doc.json            # Motion Doc (pretty-printed, stable key order)
  history.jsonl       # one line per op batch
  assets/             # images, svgs, fonts, videos, imported lotties
  renders/            # previews and exports (gitignored by default)
```

Project ids: short slugs (`launch-title-3f9a`). Writes are atomic (write temp file, rename).

## 13. Quality and testing

| Layer | What | Tool |
|---|---|---|
| Unit | ops reducer, each preset, easing, compiler rules (§7.5), linter rules, svgToShapes, text outlines | Vitest |
| Golden | `fixtures/*.motion.json` → snapshot Lottie JSON **and** rendered frames compared to reference PNGs with a pixel-diff tolerance | Vitest + canvaskit + pixelmatch |
| Schema | every compiled fixture validates against the vendored Lottie schema | Ajv |
| MCP contract | spin up the studio in-process, call every tool through an MCP client, assert structured output and error shapes | MCP TS SDK client |
| Agent eval (weekly) | 10 scripted prompts (logo reveal, lower third…) run through Claude with the MCP server; score: valid export, ≤ N calls, preview reviewed, human rubric | script + rubric |
| Editor E2E (M3+) | load project, receive live op, scrub, export | Playwright |

**CI (required on every PR, branch protection on `main`):** `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build`. No merge on red. No auto-merge bots.

## 14. Security

- Studio binds to `127.0.0.1` by default; random token required for the HTTP API and `/mcp` when bound elsewhere. Validate `Origin` on HTTP/WS (DNS-rebinding protection).
- `import_asset` with `path` is restricted to the projects root and an allow-listed import folder; with `url`, http(s) only, size limits, content-type sniffing.
- SVG import is parsed (never rendered as HTML); strip scripts/foreign objects; all exported SVG/XML attributes escaped.
- Generation keys only from env; never logged; never in project files.
- MCP App HTML is self-contained and talks only through the MCP Apps JSON-RPC bridge.

## 15. Milestones

Each milestone = one or a few small PRs, each green in CI, each with a demo.

| M | Scope | Definition of done | Est. |
|---|---|---|---|
| **M0 Foundation** | pnpm workspace, TS strict, Biome, Vitest, CI with branch protection, `.claude/` setup, canvaskit render spike committed as a test | `pnpm check` green in CI; a test renders a fixture frame to PNG | 1 day |
| **M1 Core** | Motion Doc schema, ops reducer (Immer patches), compiler for shape/image/group layers, transforms, opacity, fill/stroke, trim; presets v1 (entrances/exits/emphasis); linter; Lottie schema validation; golden tests | 10 fixtures compile, validate and match reference frames | 3–5 days |
| **M2 MCP v1** | studio server, Streamable HTTP + stdio shim; tools: create/list/get/edit/undo/validate/render_preview/list_presets/export (lottie, dotlottie); resources; prompts | From Claude Code: "make a 3 s logo reveal" → valid `.lottie` in ≤ 8 calls, preview inspected | 3–4 days |
| **M3 Editor v1** | player, layers, inspector, timeline retiming, params, live WS sync | Agent edits appear in the editor within 200 ms; manual edits visible to agent's next `get_project` | 4–6 days |
| **M4 Text, SVG, images, generation** | text outlines (opentype.js + bundled Inter/…), SVG import → shapes, image import, `generate_image` (raster + vector + transparent), cache, budget, mock provider | "Animate this logo SVG" and "make a promo with a generated hero image" work end to end | 4–5 days |
| **M5 Video** | MP4/WebM/GIF/PNG-seq export, video track + ffmpeg compositing, `generate_video` via Tasks + `get_job` | 4 s 1080p MP4 export < 10 s; generated clip composited under Lottie | 4–5 days |
| **M6 Polish & ship** | MCP App inline player, templates, `npx animator` packaging, docs, agent eval suite | Fresh machine: `npx animator dev` + `claude mcp add` works in < 2 min | 3–4 days |

## 16. Lessons from the previous attempt (grootmax/animator)

The earlier code in this repo had a reasonable architecture but never built. Avoid the same failure modes:

1. **Never auto-merge.** An Actions bot merged AI PRs and "resolved" conflicts by taking `main`'s version of every conflicted file, silently dropping half of each change. Result: ~60 type errors and calls to functions that no longer existed. (The bot was disabled and its 121-PR backlog triaged on 2026-10-07.)
2. **CI must be required and must actually run.** Every workflow ran `npm ci` against an out-of-sync lockfile, so CI failed at install and nobody noticed.
3. **One model, one mutation path.** There were five animation loops and three incompatible `Keyframe`/`Track` definitions. Here: one Motion Doc, one `applyOps`, one compiler, one renderer.
4. **No duplicate PRs.** 121 open PRs, many solving the same thing three times. One milestone, one branch, one PR at a time (or clearly separated parallel tasks).
5. **Don't build infrastructure before the product works.** Workers, SharedArrayBuffer, binary IPC and session recovery came before a working save. Here: make it work end to end first, then optimize with measurements.
6. **Wire up what you write.** Security validators and schemas existed but nothing called them. Every module must have a caller and a test in the same PR.
7. **Don't commit build artifacts** (`tsbuildinfo`, `.turbo`, `dist`).

## 17. Open questions (owner: product)

1. Who is the primary human user — developers adding animations to apps, or marketers/designers making social content? (Affects editor depth and templates.)
2. Local-only forever, or a hosted version later? (Affects auth and storage abstraction now — keep `ProjectStore` an interface either way.)
3. Which generation providers and budgets are acceptable? Is fal.ai OK as the first adapter?
4. License (MIT vs. source-available) and the npm package name.
5. Fonts to bundle by default (licensing: prefer OFL fonts such as Inter, Manrope, Space Grotesk, IBM Plex).

## 18. References

- Lottie spec (Lottie Animation Community): https://github.com/lottie/lottie-spec
- dotLottie spec: https://dotlottie.io/spec/1.0
- Skottie / CanvasKit: https://skia.org/docs/user/modules/skottie/ · npm `canvaskit-wasm`
- dotlottie-web (ThorVG): https://github.com/LottieFiles/dotlottie-web
- MCP spec (2026-07-28): https://modelcontextprotocol.io/specification/latest
- MCP TypeScript SDK v2: https://ts.sdk.modelcontextprotocol.io/v2/ (LLM-friendly: `/v2/llms-full.txt`)
- MCP Apps extension: https://github.com/modelcontextprotocol/ext-apps
- fal model APIs: https://fal.ai/docs/model-apis
- Claude Code docs: https://code.claude.com/docs/en/best-practices.md
- Jules CLI reference: https://jules.google/docs/cli/reference/
