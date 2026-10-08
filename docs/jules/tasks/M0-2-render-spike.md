# M0-2 — Headless Skottie render test in packages/render

**Branch:** `m0/render-spike` · **Milestone:** M0 · **Depends on:** M0-1 merged

Read `AGENTS.md` and `docs/PROJECT_CONTEXT.md` (§4 D3, §10) first.

## Goal

Prove the one-renderer decision: `packages/render` initialises `canvaskit-wasm` once per process, renders
a Lottie fixture frame to PNG in Node, and a test checks a pixel.

## Verified facts (tech lead ran this on canvaskit-wasm 0.42.0)

- Skottie is **only in the full build**. Load `canvaskit-wasm/bin/full/canvaskit.js` with
  `locateFile: f => <dir of that file>/f`. The default `bin/canvaskit.js` has no `MakeManagedAnimation`.
- Flow: `CK.MakeManagedAnimation(jsonString)` → `CK.MakeSurface(w, h)` → `canvas.clear(bg)` →
  `anim.seekFrame(15)` → `anim.render(canvas, CK.LTRBRect(0, 0, w, h))` → `surface.flush()` →
  `surface.makeImageSnapshot()` → `img.encodeToBytes()` (PNG) / `img.readPixels(x, y, {width:1, height:1,
  colorType: RGBA_8888, alphaType: Unpremul, colorSpace: SRGB})`.
- With the fixture below on a `#0B1020` background, frame 15 gives pixel (50,50) = `[255, 90, 95, 255]`
  and pixel (5,5) = `[11, 16, 32, 255]`.

## Do

1. `fixtures/hello-dot.json` — exactly this Lottie (100×100, 30 fps, 1 s, a 20 px `#FF5A5F` dot moving
   x 20→80 at y 50):
   ```json
   {"v":"5.7.0","fr":30,"ip":0,"op":30,"w":100,"h":100,"nm":"hello-dot","ddd":0,"assets":[],
    "layers":[{"ddd":0,"ind":1,"ty":4,"nm":"dot","sr":1,"ip":0,"op":30,"st":0,"bm":0,
     "ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]},
      "p":{"a":1,"k":[{"t":0,"s":[20,50,0],"o":{"x":[0.333],"y":[0.333]},"i":{"x":[0.667],"y":[0.667]}},{"t":30,"s":[80,50,0]}]}},
     "shapes":[{"ty":"gr","nm":"g","it":[
       {"ty":"el","p":{"a":0,"k":[0,0]},"s":{"a":0,"k":[20,20]}},
       {"ty":"fl","c":{"a":0,"k":[1,0.3529,0.3725,1]},"o":{"a":0,"k":100}},
       {"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}]}]}]}
   ```
2. `packages/render/src/canvaskit.ts` — `getCanvasKit(): Promise<CanvasKit>` that loads the full build
   once and caches the promise (one init per process).
3. `packages/render/src/renderFrame.ts` — `renderFrame({ lottie: string, frame: number, width, height,
   background: string /* hex */ }): Promise<Uint8Array>` returning PNG bytes; deletes surfaces/images it
   creates (`.delete()`).
4. Export both from `packages/render/src/index.ts`.
5. `packages/render/test/renderFrame.test.ts`: renders `fixtures/hello-dot.json` at frame 15; asserts the
   PNG signature, the dot pixel at (50,50) within ±2 per channel of `[255,90,95,255]`, the background
   pixel at (5,5), and that two calls reuse the same CanvasKit instance.
   Decode the PNG for the pixel check with `pngjs` (dev dependency) or re-read pixels via CanvasKit —
   your choice, say which.
6. Root script `render:fixture <name> [frame]` that writes `renders/<name>-<frame>.png` (use `tsx`
   as a dev dependency). Attach that PNG to the PR.

## Don't

- No contact sheets, ffmpeg, dotLottie, browser build or workers yet.
- Don't touch `packages/core`.

## Acceptance check

```bash
pnpm install --frozen-lockfile && pnpm check && pnpm build
pnpm render:fixture hello-dot 15 && file renders/hello-dot-15.png
```

CI green; PNG attached to the PR.
