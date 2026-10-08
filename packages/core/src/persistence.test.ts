import { describe, expect, it } from "vitest";
import { loadProject, saveProject } from "./persistence.js";
import type { MotionDocument } from "./types.js";

describe("Persistence", () => {
  it("saves and loads project keyframe timing and layer durations accurately", () => {
    const doc: MotionDocument = {
      version: 1,
      name: "Persistence Test",
      canvas: { width: 1080, height: 1080, fps: 60, duration: 4 },
      layers: [
        {
          id: "layer-1",
          name: "Hero Layer",
          type: "shape",
          in: 0.5,
          out: 3.5,
          tracks: {
            scale: {
              prop: "scale",
              keyframes: [
                { t: 0.5, v: [0, 0] },
                { t: 1.5, v: [100, 100] },
                { t: 3.0, v: [120, 120] },
              ],
            },
          },
        },
      ],
    };

    const serialized = saveProject(doc);
    const loaded = loadProject(serialized);

    expect(loaded).toEqual(doc);
    expect(loaded.layers[0]?.in).toBe(0.5);
    expect(loaded.layers[0]?.out).toBe(3.5);
    expect(loaded.layers[0]?.tracks.scale?.keyframes[1]?.t).toBe(1.5);
  });
});
