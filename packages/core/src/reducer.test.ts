import { describe, expect, it } from "vitest";
import {
  createInitialMotionState,
  evaluateKeyframes,
  evaluateNodeProperties,
  interpolateValue,
  motionPatchReducer,
} from "./reducer.js";
import type { Keyframe, MotionDoc, MotionPatch } from "./types.js";

describe("interpolateValue", () => {
  it("interpolates numeric values accurately", () => {
    expect(interpolateValue(0, 100, 0.5)).toBe(50);
    expect(interpolateValue(10, 20, 0.25)).toBe(12.5);
  });

  it("interpolates vector array values", () => {
    expect(interpolateValue([0, 0], [100, 200], 0.5)).toEqual([50, 100]);
  });

  it("interpolates hex color strings without type splitting", () => {
    expect(interpolateValue("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(interpolateValue("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });

  it("handles SVG path strings as discrete keyframe hold/switch", () => {
    const path1 = "M 0 0 L 10 10";
    const path2 = "M 0 0 L 20 20";
    expect(interpolateValue(path1, path2, 0.2)).toBe(path1);
    expect(interpolateValue(path1, path2, 0.8)).toBe(path2);
  });
});

describe("evaluateKeyframes", () => {
  it("evaluates keyframes correctly across playhead times", () => {
    const kfs: Keyframe[] = [
      { id: "kf1", time: 0, value: 0 },
      { id: "kf2", time: 2, value: 100 },
    ];
    expect(evaluateKeyframes(kfs, 0)).toBe(0);
    expect(evaluateKeyframes(kfs, 1)).toBe(50);
    expect(evaluateKeyframes(kfs, 2)).toBe(100);
  });

  it("respects hold easing", () => {
    const kfs: Keyframe[] = [
      { id: "kf1", time: 0, value: 0, easing: "hold" },
      { id: "kf2", time: 2, value: 100 },
    ];
    expect(evaluateKeyframes(kfs, 1)).toBe(0);
  });
});

describe("motionPatchReducer", () => {
  const doc: MotionDoc = {
    version: 1,
    name: "Test Doc",
    canvas: { width: 1080, height: 1080, fps: 30, duration: 10 },
    layers: [
      {
        id: "layer1",
        type: "shape",
        position: [0, 0],
        keyframes: {
          rotation: [
            { id: "kf1", time: 0, value: 0 },
            { id: "kf2", time: 10, value: 360 },
          ],
        },
      },
    ],
  };

  it("creates initial state and evaluates initial properties", () => {
    const state = createInitialMotionState(doc);
    expect(state.playhead).toBe(0);
    expect(state.nodeProperties.layer1?.rotation).toBe(0);
  });

  it("processes SET_PLAYHEAD patch deterministically", () => {
    const state = createInitialMotionState(doc);
    const newState = motionPatchReducer(state, {
      type: "SET_PLAYHEAD",
      playhead: 5,
    });
    expect(newState.playhead).toBe(5);
    expect(newState.nodeProperties.layer1?.rotation).toBe(180);
  });

  it("processes TICK patch deterministically", () => {
    const state = createInitialMotionState(doc);
    const newState = motionPatchReducer(state, {
      type: "TICK",
      deltaTime: 2.5,
    });
    expect(newState.playhead).toBe(2.5);
    expect(newState.nodeProperties.layer1?.rotation).toBe(90);
  });

  it("processes UPDATE_NODE_PROPERTY patch", () => {
    const state = createInitialMotionState(doc);
    const patch: MotionPatch = {
      type: "UPDATE_NODE_PROPERTY",
      nodeId: "layer1",
      property: "opacity",
      value: 50,
    };
    const newState = motionPatchReducer(state, patch);
    expect(newState.doc.layers[0]?.opacity).toBe(50);
  });
});
