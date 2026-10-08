import { describe, expect, it } from "vitest";
import { AnimationEngine, sampleTrack } from "./animationEngine.js";
import type { MotionDocument } from "./types.js";

describe("AnimationEngine", () => {
  it("samples keyframe values with linear interpolation", () => {
    const track = {
      prop: "position",
      keyframes: [
        { t: 0, v: [0, 0] },
        { t: 2, v: [100, 200] },
      ],
    };

    expect(sampleTrack(track, 0)).toEqual([0, 0]);
    expect(sampleTrack(track, 1)).toEqual([50, 100]);
    expect(sampleTrack(track, 2)).toEqual([100, 200]);
    expect(sampleTrack(track, -1)).toEqual([0, 0]);
    expect(sampleTrack(track, 3)).toEqual([100, 200]);
  });

  it("evaluates layer active range and tracks dynamically", () => {
    const doc: MotionDocument = {
      version: 1,
      name: "Test Doc",
      canvas: { width: 1080, height: 1080, fps: 60, duration: 5 },
      layers: [
        {
          id: "layer-1",
          name: "Layer 1",
          type: "shape",
          in: 1,
          out: 4,
          tracks: {
            opacity: {
              prop: "opacity",
              keyframes: [
                { t: 1, v: 0 },
                { t: 3, v: 100 },
              ],
            },
          },
        },
      ],
    };

    const engine = new AnimationEngine(doc);

    expect(engine.evaluateLayer("layer-1", 0.5)).toEqual({
      isActive: false,
      properties: { opacity: 0 },
    });

    expect(engine.evaluateLayer("layer-1", 2.0)).toEqual({
      isActive: true,
      properties: { opacity: 50 },
    });

    expect(engine.evaluateLayer("layer-1", 4.5)).toEqual({
      isActive: false,
      properties: { opacity: 100 },
    });
  });

  it("notifies subscribers when playhead or document updates", () => {
    const engine = new AnimationEngine();
    let count = 0;
    const unsubscribe = engine.subscribe(() => {
      count++;
    });

    engine.setCurrentTime(1.5);
    expect(count).toBe(1);

    unsubscribe();
    engine.setCurrentTime(2.0);
    expect(count).toBe(1);
  });
});
