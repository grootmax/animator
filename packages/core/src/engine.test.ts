import { describe, expect, it, vi } from "vitest";
import { AnimationEngine } from "./engine.js";
import type { MotionDoc } from "./types.js";

describe("AnimationEngine", () => {
  const doc: MotionDoc = {
    version: 1,
    name: "Engine Test",
    canvas: { width: 800, height: 600, fps: 30, duration: 5 },
    layers: [
      {
        id: "rect",
        type: "shape",
        keyframes: {
          scale: [
            { id: "k1", time: 0, value: [1, 1] },
            { id: "k2", time: 5, value: [2, 2] },
          ],
        },
      },
    ],
  };

  it("subscribes to state updates and emits patches on tick", () => {
    const engine = new AnimationEngine(doc);
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    engine.tick(1);

    expect(listener).toHaveBeenCalled();
    const firstCall = listener.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      const [lastCallState, lastCallPatch] = firstCall;
      expect(lastCallState.playhead).toBe(1);
      expect(lastCallPatch.type).toBe("TICK");
      expect(lastCallState.nodeProperties.rect?.scale).toEqual([1.2, 1.2]);
    }

    unsubscribe();
    engine.tick(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("handles seek correctly", () => {
    const engine = new AnimationEngine(doc);
    engine.seek(2.5);
    expect(engine.getState().playhead).toBe(2.5);
    expect(engine.getState().nodeProperties.rect?.scale).toEqual([1.5, 1.5]);
  });
});
