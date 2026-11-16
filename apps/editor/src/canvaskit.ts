import type { CanvasKit } from "canvaskit-wasm";
import CanvasKitInit from "canvaskit-wasm/bin/full/canvaskit.js";
import wasmUrl from "canvaskit-wasm/bin/full/canvaskit.wasm?url";

let browserCanvasKitPromise: Promise<CanvasKit> | null = null;

/**
 * Initializes and returns the process-wide or browser-wide CanvasKit instance
 * with Skottie animation support enabled. Initialized only once and reused across renders.
 */
export async function getEditorCanvasKit(): Promise<CanvasKit> {
  if (typeof window === "undefined" || !window.document) {
    const { getCanvasKit } = await import("@animator/render");
    return getCanvasKit();
  }

  if (!browserCanvasKitPromise) {
    browserCanvasKitPromise = CanvasKitInit({
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmUrl;
        }
        return file;
      },
    });
  }

  return browserCanvasKitPromise;
}
