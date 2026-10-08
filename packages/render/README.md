# `@animator/render`

Pluggable renderer package for Animator, featuring Skottie (`canvaskit-wasm`) as the default rendering engine and a legacy `PixiBridge` adapter for comparative regression audits.

## Features

- **`IRendererBridge` Interface**: Abstract contract defining lifecycle (`init`, `destroy`, `render`), scene node synchronization, viewport navigation (pan/zoom), and transform handle controls.
- **`SkottieBridge`**: Default rendering engine using Skia surfaces via `canvaskit-wasm`.
- **`PixiBridge`**: Legacy adapter for comparative visual validation.
- **`createRendererBridge` & `switchRendererBackend`**: Factory and smooth transition helpers to switch backend engines without losing scene state.

## Quick Start

```typescript
import { createRendererBridge, switchRendererBackend } from "@animator/render";

// Initialize default Skottie renderer
const renderer = createRendererBridge();
await renderer.init(document.getElementById("editor-canvas")!);

// Sync nodes and viewport
renderer.syncSceneNodes([
  {
    id: "layer-1",
    type: "shape",
    position: { x: 100, y: 100 },
    size: { width: 200, height: 200 },
  },
]);
renderer.updateViewport({ pan: { x: 50, y: 50 }, zoom: 1.2 });

// Smoothly toggle backends for comparative audits
const legacyRenderer = await switchRendererBackend(renderer, "pixi", container);
```

For the PixiJS deprecation timeline, see [`docs/PIXI_DEPRECATION_SCHEDULE.md`](../../docs/PIXI_DEPRECATION_SCHEDULE.md).
