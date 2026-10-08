import { describe, expect, test } from "vitest";
import { AnimationEngine } from "./engine.js";
import { CORE_VERSION, createSceneGraphStore } from "./index.js";

describe("Core Animation Engine - Offline Stepping", () => {
  test("CORE_VERSION is defined", () => {
    expect(CORE_VERSION).toBe("0.0.0");
  });

  test("Requirement 1: Supports offline deterministic stepping mode without wall-clock reliance", () => {
    const store = createSceneGraphStore({
      box: { id: "box", type: "rect", x: 0, y: 0 },
    });
    const engine = new AnimationEngine(store);

    expect(engine.isOfflineMode()).toBe(false);

    engine.setOfflineMode(true);
    expect(engine.isOfflineMode()).toBe(true);

    engine.addTrack({
      id: "track1",
      nodeId: "box",
      property: "x",
      keyframes: [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ],
    });

    // Explicit step calls advance time deterministically
    engine.seek(0);
    expect(engine.getPlayhead()).toBe(0);
    expect(store.getState().nodes.box?.x).toBe(0);

    engine.step(250);
    expect(engine.getPlayhead()).toBe(250);
    expect(store.getState().nodes.box?.x).toBe(25);

    engine.step(250);
    expect(engine.getPlayhead()).toBe(500);
    expect(store.getState().nodes.box?.x).toBe(50);
  });

  test("Requirement 2: Removes 16.67ms time quantization rounding during offline stepping", () => {
    const store = createSceneGraphStore({
      layer: { id: "layer", type: "rect", opacity: 0 },
    });
    const engine = new AnimationEngine(store);

    engine.addTrack({
      id: "t1",
      nodeId: "layer",
      property: "opacity",
      keyframes: [
        { time: 0, value: 0 },
        { time: 100, value: 1.0 },
      ],
    });

    // In offline mode, exact sub-millisecond timestamps are preserved without 16.67ms rounding drift
    engine.setOfflineMode(true);

    // Exact 24 FPS frame duration is ~41.666666666666664 ms
    const frame24Ms = 1000 / 24; // 41.666666...
    engine.seek(frame24Ms);

    // Verify playhead matches exact timestamp down to sub-millisecond precision
    expect(engine.getPlayhead()).toBeCloseTo(41.6666666, 4);

    // Verify calculated store state uses exact sub-millisecond time offset
    const opacityAtFrame24 = store.getState().nodes.layer?.opacity;
    expect(opacityAtFrame24).toBeCloseTo(41.6666666 / 100, 4);

    // Step by exact 24 FPS interval
    engine.step(frame24Ms);
    expect(engine.getPlayhead()).toBeCloseTo(83.3333333, 4);
    expect(store.getState().nodes.layer?.opacity).toBeCloseTo(
      83.3333333 / 100,
      4,
    );
  });

  test("Real-time playback quantization remains active when offline mode is false", () => {
    const store = createSceneGraphStore({
      box: { id: "box", type: "rect", x: 0 },
    });
    const engine = new AnimationEngine(store);

    engine.setOfflineMode(false);
    engine.seek(10); // 10ms in real-time mode snaps to 16.67ms multiple
    expect(engine.getPlayhead()).toBe(16.67);
  });
});
