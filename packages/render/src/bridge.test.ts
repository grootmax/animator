import { describe, expect, it, vi } from "vitest";
import {
  PixiBridge,
  SkottieBridge,
  createRendererBridge,
  switchRendererBackend,
} from "./index.js";
import type { SceneNode, TransformHandle } from "./types.js";

describe("IRendererBridge & Adapters", () => {
  const dummyContainer = {} as HTMLElement;

  const sampleNodes: SceneNode[] = [
    {
      id: "rect-1",
      type: "shape",
      position: { x: 100, y: 100 },
      size: { width: 200, height: 150 },
      opacity: 100,
      visible: true,
    },
    {
      id: "text-1",
      type: "text",
      position: { x: 300, y: 300 },
      opacity: 80,
      visible: true,
    },
  ];

  const sampleHandles: TransformHandle[] = [
    {
      id: "handle-tl",
      type: "corner",
      position: { x: 0, y: 0 },
      cursor: "nwse-resize",
    },
    {
      id: "handle-br",
      type: "corner",
      position: { x: 200, y: 150 },
      cursor: "nwse-resize",
    },
  ];

  it("defaults to SkottieBridge as primary engine in createRendererBridge", () => {
    const bridge = createRendererBridge();
    expect(bridge.backendType).toBe("skottie");
    expect(bridge).toBeInstanceOf(SkottieBridge);
  });

  it("creates PixiBridge when backend flag is pixi", () => {
    const bridge = createRendererBridge({ backend: "pixi" });
    expect(bridge.backendType).toBe("pixi");
    expect(bridge).toBeInstanceOf(PixiBridge);
  });

  it("SkottieBridge initializes and executes lifecycle render contract", async () => {
    const bridge = new SkottieBridge({ width: 800, height: 600 });
    const renderSpy = vi.fn();
    bridge.on("render", renderSpy);

    await bridge.init(dummyContainer);
    expect(renderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: "skottie",
      }),
    );

    bridge.syncSceneNodes(sampleNodes);
    expect(bridge.getSceneNodes()).toEqual(sampleNodes);

    bridge.destroy();
  });

  it("PixiBridge initializes and executes lifecycle render contract", async () => {
    const bridge = new PixiBridge({ width: 800, height: 600 });
    const renderSpy = vi.fn();
    bridge.on("render", renderSpy);

    await bridge.init(dummyContainer);
    expect(renderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: "pixi",
      }),
    );

    bridge.syncSceneNodes(sampleNodes);
    expect(bridge.getSceneNodes()).toEqual(sampleNodes);

    bridge.destroy();
  });

  it("Viewport navigation (pan and zoom) operates identically across backends", async () => {
    const skottie = createRendererBridge({ backend: "skottie" });
    const pixi = createRendererBridge({ backend: "pixi" });

    await skottie.init(dummyContainer);
    await pixi.init(dummyContainer);

    const panZoom = { pan: { x: 50, y: -20 }, zoom: 1.5 };

    skottie.updateViewport(panZoom);
    pixi.updateViewport(panZoom);

    expect(skottie.getViewport()).toEqual(panZoom);
    expect(pixi.getViewport()).toEqual(panZoom);

    skottie.destroy();
    pixi.destroy();
  });

  it("Transform handle controls function across both backend implementations", async () => {
    const skottie = createRendererBridge({ backend: "skottie" });
    const pixi = createRendererBridge({ backend: "pixi" });

    await skottie.init(dummyContainer);
    await pixi.init(dummyContainer);

    skottie.setTransformHandles(sampleHandles);
    pixi.setTransformHandles(sampleHandles);

    expect(skottie.getTransformHandles()).toEqual(sampleHandles);
    expect(pixi.getTransformHandles()).toEqual(sampleHandles);

    skottie.destroy();
    pixi.destroy();
  });

  it("switches renderer backend smoothly preserving nodes, viewport, and handles", async () => {
    let bridge = createRendererBridge({ backend: "skottie" });
    await bridge.init(dummyContainer);

    bridge.syncSceneNodes(sampleNodes);
    bridge.updateViewport({ pan: { x: 120, y: 80 }, zoom: 2.0 });
    bridge.setTransformHandles(sampleHandles);

    expect(bridge.backendType).toBe("skottie");

    // Switch to PixiJS backend
    bridge = await switchRendererBackend(bridge, "pixi", dummyContainer);

    expect(bridge.backendType).toBe("pixi");
    expect(bridge.getSceneNodes()).toEqual(sampleNodes);
    expect(bridge.getViewport()).toEqual({ pan: { x: 120, y: 80 }, zoom: 2.0 });
    expect(bridge.getTransformHandles()).toEqual(sampleHandles);

    // Switch back to Skottie backend
    bridge = await switchRendererBackend(bridge, "skottie", dummyContainer);

    expect(bridge.backendType).toBe("skottie");
    expect(bridge.getSceneNodes()).toEqual(sampleNodes);
    expect(bridge.getViewport()).toEqual({ pan: { x: 120, y: 80 }, zoom: 2.0 });
    expect(bridge.getTransformHandles()).toEqual(sampleHandles);

    bridge.destroy();
  });
});
