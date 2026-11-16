import { createRequire } from "node:module";
import path from "node:path";
import type { CanvasKit, CanvasKitInitOptions } from "canvaskit-wasm";

type CanvasKitInitFn = (opts?: CanvasKitInitOptions) => Promise<CanvasKit>;

let canvasKitPromise: Promise<CanvasKit> | null = null;

/**
 * Initializes and returns the process-wide CanvasKit instance (full build with Skottie support).
 * Cached so initialization occurs only once per process.
 */
export function getCanvasKit(): Promise<CanvasKit> {
  if (!canvasKitPromise) {
    canvasKitPromise = (async () => {
      const require = createRequire(import.meta.url);
      const fullJsPath = require.resolve(
        "canvaskit-wasm/bin/full/canvaskit.js",
      );
      const canvaskitWasmPath = require.resolve(
        "canvaskit-wasm/bin/full/canvaskit.wasm",
      );
      const wasmDir = path.dirname(canvaskitWasmPath);

      const fullModule = (await import(fullJsPath)) as {
        default?: CanvasKitInitFn;
      };
      const initFn =
        fullModule.default ?? (fullModule as unknown as CanvasKitInitFn);

      const ck = await initFn({
        locateFile: (file: string) => path.join(wasmDir, file),
      });
      return ck;
    })();
  }
  return canvasKitPromise;
}
