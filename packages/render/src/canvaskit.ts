import type { CanvasKit } from "canvaskit-wasm";

let canvasKitPromise: Promise<CanvasKit> | null = null;

export async function getCanvasKit(): Promise<CanvasKit> {
  if (canvasKitPromise) {
    return canvasKitPromise;
  }

  canvasKitPromise = (async () => {
    if (typeof window !== "undefined") {
      // Browser environment: load from package WASM path
      const CanvasKitInitModule = (await import(
        "canvaskit-wasm/bin/full/canvaskit.js"
      )) as unknown as { default?: (opts: unknown) => Promise<CanvasKit> };
      const CanvasKitInit =
        CanvasKitInitModule.default ||
        (CanvasKitInitModule as unknown as (
          opts: unknown,
        ) => Promise<CanvasKit>);
      const ck = await CanvasKitInit({
        locateFile: (file: string) =>
          `https://unpkg.com/canvaskit-wasm@0.39.1/bin/full/${file}`,
      });
      return ck;
    }

    // Node environment: load full build via createRequire
    const { createRequire } = await import("node:module");
    const path = await import("node:path");
    const require = createRequire(import.meta.url);
    const fullDir = path.dirname(
      require.resolve("canvaskit-wasm/bin/full/canvaskit.js"),
    );
    const CanvasKitInit = require("canvaskit-wasm/bin/full/canvaskit.js");
    const ck = await CanvasKitInit({
      locateFile: (file: string) => path.join(fullDir, file),
    });
    return ck as CanvasKit;
  })();

  return canvasKitPromise;
}
