import { describe, expect, it } from "vitest";
import { ExportWorkerController } from "./exportWorker.js";
import type { ExportMessageFromWorker, SceneData } from "./types.js";

describe("ExportWorkerController", () => {
  it("executes deterministic frame stepping and emits progress/complete events", async () => {
    const messages: ExportMessageFromWorker[] = [];

    const controller = new ExportWorkerController((msg) => {
      messages.push(msg);
    });

    const scene: SceneData = {
      width: 200,
      height: 200,
      fps: 10,
      duration: 1, // 10 frames
      background: "#000000",
      layers: [
        {
          id: "rect1",
          type: "rect",
          position: [100, 100],
          size: [50, 50],
        },
      ],
    };

    await controller.handleMessage({
      type: "init",
      sceneData: scene,
      options: {
        width: 200,
        height: 200,
        fps: 10,
        duration: 1,
      },
    });

    const progressMsgs = messages.filter((m) => m.type === "progress");
    const chunkMsgs = messages.filter((m) => m.type === "chunk");
    const completeMsgs = messages.filter((m) => m.type === "complete");

    expect(progressMsgs.length).toBe(10); // 10 frames
    expect(chunkMsgs.length).toBe(10);
    expect(completeMsgs.length).toBe(1);

    if (completeMsgs[0]?.type === "complete") {
      expect(completeMsgs[0].totalFrames).toBe(10);
      expect(completeMsgs[0].chunksCount).toBe(10);
    }
  });

  it("handles cancellation gracefully", async () => {
    const messages: ExportMessageFromWorker[] = [];

    const controller = new ExportWorkerController((msg) => {
      messages.push(msg);
    });

    const scene: SceneData = {
      width: 100,
      height: 100,
      fps: 30,
      duration: 5, // 150 frames
      layers: [],
    };

    // Cancel before or during execution
    const exportPromise = controller.handleMessage({
      type: "init",
      sceneData: scene,
      options: { width: 100, height: 100, fps: 30, duration: 5 },
    });

    await controller.handleMessage({ type: "cancel" });
    await exportPromise;

    const errorMsgs = messages.filter((m) => m.type === "error");
    expect(errorMsgs.length).toBeGreaterThan(0);
    if (errorMsgs[0]?.type === "error") {
      expect(errorMsgs[0].error).toContain("cancelled");
    }
  });
});
