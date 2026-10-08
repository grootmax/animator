import { describe, expect, it } from "vitest";
import { ExportWorkerClient, startOffscreenExport } from "./exportClient.js";
import type { SceneData } from "./types.js";

describe("ExportWorkerClient & startOffscreenExport", () => {
  it("detects feature support correctly", () => {
    expect(typeof ExportWorkerClient.isOffscreenSupported()).toBe("boolean");
    expect(typeof ExportWorkerClient.isWebCodecsSupported()).toBe("boolean");
  });

  it("runs background export with callbacks and resolves result", async () => {
    const scene: SceneData = {
      width: 100,
      height: 100,
      fps: 10,
      duration: 0.5, // 5 frames
      layers: [
        {
          id: "l1",
          type: "rect",
          position: [50, 50],
          size: [20, 20],
        },
      ],
    };

    let progressCount = 0;
    let chunkCount = 0;

    const exportTask = startOffscreenExport(
      scene,
      { width: 100, height: 100, fps: 10, duration: 0.5 },
      {
        onProgress: (p) => {
          progressCount++;
          expect(p.totalFrames).toBe(5);
        },
        onChunk: () => {
          chunkCount++;
        },
      },
    );

    const result = await exportTask.promise;

    expect(result.totalFrames).toBe(5);
    expect(progressCount).toBe(5);
    expect(chunkCount).toBe(5);
  });
});
