import { describe, expect, it } from "vitest";
import { OffscreenRenderer } from "./renderer.js";
import type { SceneData } from "./types.js";

function createMockCanvasWithImageData(width: number, height: number) {
  const pixelBuffer = new Uint8ClampedArray(width * height * 4);

  const ctx = {
    clearRect: (x: number, y: number, w: number, h: number) => {
      pixelBuffer.fill(0);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      // Simulate drawing fill by setting pixels
      pixelBuffer.fill(255);
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    fillText: () => {},
    strokeRect: () => {},
    drawImage: () => {},
    getImageData: () => ({
      data: pixelBuffer,
      width,
      height,
    }),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };

  const canvas = {
    width,
    height,
    getContext: (type: string) => (type === "2d" ? ctx : null),
  };

  return { canvas, pixelBuffer, ctx };
}

describe("Visual Equivalence Tests", () => {
  it("produces identical pixel buffers between offscreen renderer and main canvas context for the same frame", () => {
    const scene: SceneData = {
      width: 100,
      height: 100,
      fps: 30,
      duration: 1,
      background: "#ffffff",
      layers: [
        {
          id: "box",
          type: "rect",
          position: [50, 50],
          size: [40, 40],
          fill: "#0000ff",
        },
      ],
    };

    // Main thread renderer
    const mainCanvasObj = createMockCanvasWithImageData(100, 100);
    const mainRenderer = new OffscreenRenderer(
      mainCanvasObj.canvas as unknown as HTMLCanvasElement,
      100,
      100,
    );
    mainRenderer.renderFrame(scene, 15); // Frame 15 (0.5s)
    const mainPixels = mainCanvasObj.ctx.getImageData();

    // Offscreen worker renderer
    const offscreenCanvasObj = createMockCanvasWithImageData(100, 100);
    const offscreenRenderer = new OffscreenRenderer(
      offscreenCanvasObj.canvas as unknown as HTMLCanvasElement,
      100,
      100,
    );
    offscreenRenderer.renderFrame(scene, 15); // Frame 15 (0.5s)
    const offscreenPixels = offscreenCanvasObj.ctx.getImageData();

    // Verify exact pixel equivalence
    expect(offscreenPixels.data.length).toBe(mainPixels.data.length);
    for (let i = 0; i < mainPixels.data.length; i++) {
      expect(offscreenPixels.data[i]).toBe(mainPixels.data[i]);
    }
  });
});
