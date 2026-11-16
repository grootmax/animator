import type { CanvasKit, CanvasKitInitOptions } from "canvaskit-wasm";

type CanvasKitInitFn = (opts?: CanvasKitInitOptions) => Promise<CanvasKit>;

let canvasKitPromise: Promise<CanvasKit> | null = null;

/**
 * Initializes and returns the process-wide CanvasKit instance (full build with Skottie support).
 * Cached so initialization occurs only once per process.
 */
export function getCanvasKit(
  options?: CanvasKitInitOptions,
): Promise<CanvasKit> {
  if (!canvasKitPromise) {
    canvasKitPromise = (async () => {
      const fullModule = (await import(
        "canvaskit-wasm/bin/full/canvaskit.js"
      )) as unknown as {
        default?: CanvasKitInitFn;
      };
      const initFn =
        fullModule.default ?? (fullModule as unknown as CanvasKitInitFn);

      return initFn(options);
    })();
  }
  return canvasKitPromise;
}
