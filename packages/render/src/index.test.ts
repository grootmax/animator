import { AnimationEngine, createSceneGraphStore } from "@animator/core";
import { describe, expect, test, vi } from "vitest";
import { ExportController } from "./exportController.js";
import { PixiBridge, RENDER_VERSION } from "./index.js";

describe("Render Package - Synchronous Canvas Flush & Export Pipeline", () => {
  test("RENDER_VERSION is defined", () => {
    expect(RENDER_VERSION).toBe("0.0.0");
  });

  test("Requirement 3: Pixi bridge provides synchronous flushSync method bypassing microtask queue", () => {
    const store = createSceneGraphStore({
      shape1: { id: "shape1", type: "rect", x: 10, y: 20, fill: "#FF0000" },
    });
    const bridge = new PixiBridge(store);

    // Initial flushSync populates display objects synchronously
    bridge.flushSync();
    expect(bridge.displayObjects.has("shape1")).toBe(true);
    expect(bridge.displayObjects.get("shape1")?.x).toBe(10);

    // Update store node via established store pathway
    store.updateNode("shape1", { x: 50, y: 100 });

    // Instantly calling flushSync updates display objects synchronously in the current turn
    // without waiting for microtasks or promises
    bridge.flushSync();

    const displayObj = bridge.displayObjects.get("shape1");
    expect(displayObj?.x).toBe(50);
    expect(displayObj?.y).toBe(100);

    // Verify synchronous flushing did not mutate scene graph data in store
    expect(store.getState().nodes.shape1?.x).toBe(50);
    expect(store.getState().nodes.shape1?.y).toBe(100);
  });

  test("Requirement 4: Direct frame render function forces immediate stage compilation and canvas redraw", () => {
    const store = createSceneGraphStore({
      circle: { id: "circle", type: "circle", x: 0, fill: "#00FF00" },
    });

    let redrawCalled = false;
    const mockCanvas = {
      width: 500,
      height: 500,
      getContext: () => ({
        clearRect: () => {
          redrawCalled = true;
        },
        save: () => {},
        restore: () => {},
        fillRect: () => {},
      }),
      toDataURL: () => "data:image/png;base64,mockCanvasData",
    };

    const bridge = new PixiBridge(store, mockCanvas);

    store.updateNode("circle", { x: 120 });

    // Calling renderFrame immediately compiles stage and redraws canvas synchronously
    bridge.renderFrame();

    expect(redrawCalled).toBe(true);
    expect(bridge.displayObjects.get("circle")?.x).toBe(120);
  });

  test("Requirement 5 & Acceptance Criteria 3: Export controller sequences deterministic synchronous loop without dropped frames", () => {
    const store = createSceneGraphStore({
      animatedBox: { id: "animatedBox", type: "rect", x: 0 },
    });
    const engine = new AnimationEngine(store);

    engine.addTrack({
      id: "track_box_x",
      nodeId: "animatedBox",
      property: "x",
      keyframes: [
        { time: 0, value: 0 },
        { time: 1000, value: 300 },
      ],
    });

    const mockCanvas = {
      width: 800,
      height: 600,
      getContext: () => ({
        clearRect: () => {},
        save: () => {},
        restore: () => {},
        fillRect: () => {},
      }),
      toDataURL: (type = "image/png") =>
        `data:${type};base64,frame_x${store.getState().nodes.animatedBox?.x}`,
    };

    const bridge = new PixiBridge(store, mockCanvas);
    const exportController = new ExportController(engine, bridge, mockCanvas);

    const onFrameSpy = vi.fn();

    // Export 1 second (1000ms) at 30 FPS => exactly 30 frames
    const frames = exportController.exportFrames({
      fps: 30,
      duration: 1000,
      onFrame: onFrameSpy,
    });

    // Zero dropped frames assertion
    expect(frames.length).toBe(30);
    expect(onFrameSpy).toHaveBeenCalledTimes(30);

    // Verify first frame (t=0ms -> x=0) and middle/end frame values
    expect(frames[0]).toContain("frame_x0");
    expect(frames[29]).toContain("frame_x290"); // At frame index 29: 29 * (1000/30) = 966.67ms => x = 290
  });

  test("Releases intermediate texture references per frame to maintain stable memory consumption", () => {
    const store = createSceneGraphStore({
      node1: { id: "node1", type: "rect", x: 0 },
    });
    const bridge = new PixiBridge(store);

    const textureDestroySpy = vi.fn();
    (
      bridge as unknown as {
        textures: Map<string, { destroy: typeof textureDestroySpy }>;
      }
    ).textures.set("tex1", { destroy: textureDestroySpy });

    bridge.releaseFrameTextures();

    expect(textureDestroySpy).toHaveBeenCalledWith(true);
    expect(
      (bridge as unknown as { textures: Map<string, unknown> }).textures.size,
    ).toBe(0);
  });
});
