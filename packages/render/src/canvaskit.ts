import { createRequire } from "node:module";
import path from "node:path";
import CanvasKitInit, {
  type CanvasKit,
  type CanvasKitInitOptions,
} from "canvaskit-wasm/bin/full/canvaskit.js";

let canvasKitPromise: Promise<CanvasKit> | null = null;

export async function getCanvasKit(): Promise<CanvasKit> {
  if (canvasKitPromise) {
    return canvasKitPromise;
  }

  canvasKitPromise = (async () => {
    const require = createRequire(
      import.meta.url || `file://${process.cwd()}/index.ts`,
    );
    const canvaskitBinDir = path.dirname(
      require.resolve("canvaskit-wasm/bin/full/canvaskit.js"),
    );

    const initFn = CanvasKitInit as unknown as (
      opts: CanvasKitInitOptions,
    ) => Promise<CanvasKit>;

    const ck = await initFn({
      locateFile: (file: string) => path.join(canvaskitBinDir, file),
    });

    return ck;
  })();

  return canvasKitPromise;
}

export type { CanvasKit };
