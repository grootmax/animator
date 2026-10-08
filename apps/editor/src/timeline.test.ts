import { AnimationEngine } from "@animator/core";
import type { MotionDoc } from "@animator/core";
import { describe, expect, it, vi } from "vitest";

describe("Timeline Component Reactivity & Editor Worker", () => {
  const doc: MotionDoc = {
    version: 1,
    name: "Timeline Test Doc",
    canvas: { width: 500, height: 500, fps: 30, duration: 10 },
    layers: [],
  };

  it("notifies reactive subscribers when playhead updates", () => {
    const engine = new AnimationEngine(doc);
    const subscriber = vi.fn();

    const unsubscribe = engine.subscribe(subscriber);
    engine.seek(4.5);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const firstCall = subscriber.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      const state = firstCall[0];
      expect(state.playhead).toBe(4.5);
    }

    unsubscribe();
  });
});
