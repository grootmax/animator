import { describe, expect, it } from "vitest";
import { AnimationEngine, AnimationWorkerRuntime } from "./index.js";
import type { MotionDoc } from "./types.js";

describe("@monorepo/animation-engine package exports and worker runtime", () => {
  const sampleDoc: MotionDoc = {
    version: 1,
    name: "Monorepo Animation Engine Test",
    canvas: { width: 1000, height: 1000, fps: 30, duration: 4 },
    layers: [
      {
        id: "box",
        type: "shape",
        keyframes: {
          opacity: [
            { id: "k1", time: 0, value: 0 },
            { id: "k2", time: 4, value: 100 },
          ],
        },
      },
    ],
  };

  it("exports AnimationEngine and executes state transitions", () => {
    const engine = new AnimationEngine(sampleDoc);
    expect(engine.getState().playhead).toBe(0);
    engine.seek(2);
    expect(engine.getState().nodeProperties.box?.opacity).toBe(50);
  });

  it("processes state patches in AnimationWorkerRuntime deterministically", () => {
    const runtime = new AnimationWorkerRuntime();
    const initialState = runtime.init(sampleDoc);
    expect(initialState.playhead).toBe(0);

    const updatedState = runtime.applyPatch({
      type: "SET_PLAYHEAD",
      playhead: 3,
    });
    expect(updatedState?.playhead).toBe(3);
    expect(updatedState?.nodeProperties.box?.opacity).toBe(75);
  });
});
