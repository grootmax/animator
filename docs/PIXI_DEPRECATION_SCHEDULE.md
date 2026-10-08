# PixiJS Deprecation Schedule & Skottie Migration Plan

## Context & Purpose

`@animator/render` is transitioning from legacy PixiJS drawing adapters (`PixiBridge`) to Skottie via `canvaskit-wasm` (`SkottieBridge`) as the primary rendering engine.

Skottie via canvaskit-wasm ensures complete visual consistency between:
- Headless server frame rendering (previews & MP4/WebM exports)
- Browser live editor preview
- Native Lottie specification compliance

To prevent visual regressions during editor viewport navigation (pan, zoom, and transform handle updates), `IRendererBridge` abstracts backend drawing calls while providing a feature toggle (`backend: "pixi"`) for comparative audits during QA.

---

## Deprecation Roadmap & Timeline

| Phase | Target Milestone | Description | Status |
|---|---|---|---|
| **Phase 1: Pluggable Abstraction** | M0 / Current | Introduce `IRendererBridge` with `SkottieBridge` as default engine and `PixiBridge` behind feature configuration toggle. | **Completed** |
| **Phase 2: Comparative QA Audits** | M3 | Run comparative visual regression test suite across scene graph nodes, viewport pan/zoom, and transform handle interactions. | Planned |
| **Phase 3: Soft Deprecation Warning** | M4 | Emit runtime deprecation log warnings when `PixiBridge` (`backend: "pixi"`) is initialized. | Planned |
| **Phase 4: Full Removal** | M5 | Remove `PixiBridge` module and any remaining PixiJS package dependencies from the monorepo. | Planned |

---

## Configuration & Usage

### Default Usage (Skottie Bridge)
```typescript
import { createRendererBridge } from "@animator/render";

// Defaults to SkottieBridge (canvaskit-wasm)
const renderer = createRendererBridge();
await renderer.init(containerElement);
```

### Comparative Audit Toggle (Pixi Bridge)
```typescript
import { createRendererBridge, switchRendererBackend } from "@animator/render";

// Explicitly opt into legacy PixiJS backend for comparison
let renderer = createRendererBridge({ backend: "pixi" });
await renderer.init(containerElement);

// Switch backends at runtime cleanly preserving viewport state & nodes
renderer = await switchRendererBackend(renderer, "skottie", containerElement);
```
