import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alignToFrameInterval,
  subscribeToOperations,
  useSceneGraphStore,
} from "./sceneGraphStore.js";

describe("useSceneGraphStore", () => {
  beforeEach(() => {
    useSceneGraphStore.setState({
      document: {
        version: 1,
        name: "Test Store Doc",
        canvas: { width: 1080, height: 1080, fps: 60, duration: 4 },
        layers: [
          {
            id: "layer-1",
            name: "Layer 1",
            type: "shape",
            in: 0,
            out: 4,
            tracks: {
              position: {
                prop: "position",
                keyframes: [
                  { t: 0, v: [0, 0] },
                  { t: 2, v: [100, 100] },
                ],
              },
            },
          },
        ],
      },
      playheadTime: 0,
      selectedLayerId: "layer-1",
    });
  });

  it("aligns timestamps to 16.67ms frame intervals (60 fps)", () => {
    expect(alignToFrameInterval(0.01)).toBe(0.017); // 1 frame ~ 0.01667s -> 0.017s
    expect(alignToFrameInterval(0.033)).toBe(0.033);
    expect(alignToFrameInterval(1.0)).toBe(1.0);
  });

  it("dispatches updateKeyframeTime and emits operation", () => {
    const listener = vi.fn();
    const unsub = subscribeToOperations(listener);

    const store = useSceneGraphStore.getState();
    store.updateKeyframeTime("layer-1", "position", 1, 1.5);

    const doc = useSceneGraphStore.getState().document;
    const kf = doc.layers[0]?.tracks.position?.keyframes[1];
    expect(kf?.t).toBe(1.5);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "updateKeyframeTime",
        layerId: "layer-1",
        prop: "position",
        keyframeIndex: 1,
        newTime: 1.5,
      }),
    );

    unsub();
  });

  it("dispatches updateLayerDuration with 16.67ms frame alignment", () => {
    const store = useSceneGraphStore.getState();
    store.updateLayerDuration("layer-1", { inTime: 0.5, outTime: 3.5 });

    const doc = useSceneGraphStore.getState().document;
    expect(doc.layers[0]?.in).toBe(0.5);
    expect(doc.layers[0]?.out).toBe(3.5);
  });

  it("applies remote operation without re-broadcasting", () => {
    const listener = vi.fn();
    const unsub = subscribeToOperations(listener);

    const store = useSceneGraphStore.getState();
    store.applyRemote({
      type: "updateKeyframeTime",
      layerId: "layer-1",
      prop: "position",
      keyframeIndex: 0,
      newTime: 0.5,
      source: "remote",
    });

    const doc = useSceneGraphStore.getState().document;
    const kf = doc.layers[0]?.tracks.position?.keyframes[0];
    expect(kf?.t).toBe(0.5);

    expect(listener).not.toHaveBeenCalled();

    unsub();
  });
});
