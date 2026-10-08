import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { CanvasKit, CanvasKitInitOptions } from "canvaskit-wasm";

let canvasKitPromise: Promise<CanvasKit> | null = null;

export function getCanvasKit(): Promise<CanvasKit> {
  if (!canvasKitPromise) {
    canvasKitPromise = (async () => {
      const require = createRequire(import.meta.url);
      const canvaskitJsPath = require.resolve(
        "canvaskit-wasm/bin/full/canvaskit.js",
      );
      const canvaskitBinDir = dirname(canvaskitJsPath);
      const module = await import("canvaskit-wasm/bin/full/canvaskit.js");
      const createCanvasKit = (module.default || module) as unknown as (
        opts?: CanvasKitInitOptions,
      ) => Promise<CanvasKit>;
      const ck = await createCanvasKit({
        locateFile: (file: string) => `${canvaskitBinDir}/${file}`,
      });
      return ck;
    })();
  }
  return canvasKitPromise;
}
