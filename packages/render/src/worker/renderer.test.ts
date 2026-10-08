import { describe, expect, it } from "vitest";
import { OffscreenRenderer } from "./renderer.js";
import type { SceneData } from "./types.js";

function createMockCanvas(width: number, height: number) {
  const operations: string[] = [];

  const ctx = {
    clearRect: (x: number, y: number, w: number, h: number) => {
      operations.push(`clearRect:${x},${y},${w},${h}`);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      operations.push(`fillRect:${x},${y},${w},${h}`);
    },
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    translate: (x: number, y: number) => operations.push(`translate:${x},${y}`),
    scale: (x: number, y: number) => operations.push(`scale:${x},${y}`),
    fillText: (text: string, x: number, y: number) =>
      operations.push(`fillText:${text},${x},${y}`),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      operations.push(`strokeRect:${x},${y},${w},${h}`),
    drawImage: () => operations.push("drawImage"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  };

  const canvas = {
    width,
    height,
    getContext: (type: string) => (type === "2d" ? ctx : null),
  };

  return { canvas, ctx, operations };
}

describe("OffscreenRenderer", () => {
  it("initializes canvas dimensions and context", () => {
    const { canvas } = createMockCanvas(800, 600);
    const renderer = new OffscreenRenderer(
      canvas as unknown as HTMLCanvasElement,
      800,
      600,
    );

    expect(renderer.getCanvas().width).toBe(800);
    expect(renderer.getCanvas().height).toBe(600);
  });

  it("renders background and rect layers deterministically", () => {
    const { canvas, operations } = createMockCanvas(500, 500);
    const renderer = new OffscreenRenderer(
      canvas as unknown as HTMLCanvasElement,
      500,
      500,
    );

    const scene: SceneData = {
      width: 500,
      height: 500,
      fps: 30,
      duration: 2,
      background: "#112233",
      layers: [
        {
          id: "rect1",
          type: "rect",
          position: [250, 250],
          size: [100, 100],
          fill: "#ff0000",
        },
      ],
    };

    renderer.renderFrame(scene, 0);

    expect(operations).toContain("clearRect:0,0,500,500");
    expect(operations).toContain("fillRect:0,0,500,500");
    expect(operations).toContain("translate:250,250");
    expect(operations).toContain("fillRect:-50,-50,100,100");
  });

  it("interpolates layer keyframes correctly across frame steps", () => {
    const { canvas, operations } = createMockCanvas(500, 500);
    const renderer = new OffscreenRenderer(
      canvas as unknown as HTMLCanvasElement,
      500,
      500,
    );

    const scene: SceneData = {
      width: 500,
      height: 500,
      fps: 10,
      duration: 1,
      layers: [
        {
          id: "movingLayer",
          type: "rect",
          position: [0, 0],
          size: [50, 50],
          keyframes: [
            { time: 0, position: [0, 0] },
            { time: 1, position: [100, 200] },
          ],
        },
      ],
    };

    // Frame 0 at t=0s -> [0, 0]
    renderer.renderFrame(scene, 0);
    expect(operations).toContain("translate:0,0");

    // Frame 5 at t=0.5s -> midpoint [50, 100]
    operations.length = 0;
    renderer.renderFrame(scene, 5);
    expect(operations).toContain("translate:50,100");

    // Frame 10 at t=1.0s -> end [100, 200]
    operations.length = 0;
    renderer.renderFrame(scene, 10);
    expect(operations).toContain("translate:100,200");
  });
});
