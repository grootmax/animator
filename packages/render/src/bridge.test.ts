import { describe, expect, it } from "vitest";
import { CanvasKitBridge, parseColor } from "./bridge.js";
import type { SceneNode } from "./nodeTypes.js";

describe("CanvasKitBridge & Node Rendering", () => {
  it("parses hex colors into normalized RGBA arrays", () => {
    expect(parseColor("#FF0000", 1.0)).toEqual([1, 0, 0, 1]);
    expect(parseColor("#00FF00", 0.5)).toEqual([0, 1, 0, 0.5]);
    expect(parseColor("#0000FF", 1.0)).toEqual([0, 0, 1, 1]);
    expect(parseColor("#FFF")).toEqual([1, 1, 1, 1]);
  });

  it("initializes CanvasKit and binds surface", async () => {
    const bridge = await CanvasKitBridge.create();
    expect(bridge.getCanvasKitInstance()).toBeDefined();

    const success = bridge.initSurface(400, 400);
    expect(success).toBe(true);
  });

  it("synchronizes viewport pan and zoom matrix transforms", async () => {
    const bridge = await CanvasKitBridge.create();
    bridge.setViewport({ panX: 100, panY: 50, zoom: 2.0 });

    const vp = bridge.getViewport();
    expect(vp).toEqual({ panX: 100, panY: 50, zoom: 2.0 });

    const scenePt = bridge.screenToScene(200, 150);
    expect(scenePt).toEqual({ x: 50, y: 50 });

    const screenPt = bridge.sceneToScreen(50, 50);
    expect(screenPt).toEqual({ x: 200, y: 150 });
  });

  it("renders scene nodes without crashing", async () => {
    const bridge = await CanvasKitBridge.create();
    bridge.initSurface(500, 500);

    const nodes: SceneNode[] = [
      {
        id: "rect-1",
        type: "rectangle",
        x: 50,
        y: 50,
        width: 100,
        height: 80,
        fill: "#FF5A5F",
        strokeColor: "#FFFFFF",
        strokeWidth: 2,
        cornerRadius: 8,
      },
      {
        id: "circle-1",
        type: "circle",
        x: 200,
        y: 200,
        radius: 40,
        fill: "#00FF00",
      },
      {
        id: "ellipse-1",
        type: "ellipse",
        x: 350,
        y: 200,
        radiusX: 30,
        radiusY: 50,
        fill: "#0000FF",
      },
      {
        id: "path-1",
        type: "path",
        x: 50,
        y: 300,
        d: "M 0 0 L 50 0 L 25 50 Z",
        fill: "#FFFF00",
      },
      {
        id: "line-1",
        type: "line",
        x: 0,
        y: 0,
        x1: 10,
        y1: 10,
        x2: 90,
        y2: 90,
        strokeColor: "#FF00FF",
        strokeWidth: 4,
      },
      {
        id: "polyline-1",
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: 100, y: 400 },
          { x: 150, y: 450 },
          { x: 200, y: 400 },
        ],
        strokeColor: "#00FFFF",
        strokeWidth: 3,
      },
      {
        id: "image-1",
        type: "image",
        x: 300,
        y: 350,
        width: 80,
        height: 80,
      },
    ];

    bridge.setSelectedNodeId("rect-1");
    expect(() => bridge.renderScene(nodes, "#0B1020")).not.toThrow();
  });

  it("calculates node bounds accurately", async () => {
    const bridge = await CanvasKitBridge.create();
    const rectNode: SceneNode = {
      id: "r1",
      type: "rectangle",
      width: 120,
      height: 80,
    };
    const bounds = bridge.calculateNodeBounds(rectNode);
    expect(bounds).toEqual({ x: 0, y: 0, width: 120, height: 80 });

    const circleNode: SceneNode = {
      id: "c1",
      type: "circle",
      radius: 25,
    };
    const circleBounds = bridge.calculateNodeBounds(circleNode);
    expect(circleBounds).toEqual({ x: -25, y: -25, width: 50, height: 50 });
  });
});
