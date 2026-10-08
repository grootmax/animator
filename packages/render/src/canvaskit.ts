import CanvasKitInit, { type CanvasKit } from "canvaskit-wasm";

let canvasKitPromise: Promise<CanvasKit> | null = null;

export async function getCanvasKit(): Promise<CanvasKit> {
  if (!canvasKitPromise) {
    const initFn = CanvasKitInit as unknown as (
      opts?: unknown,
    ) => Promise<CanvasKit>;
    canvasKitPromise = initFn();
  }
  return canvasKitPromise;
}

export type { CanvasKit };
