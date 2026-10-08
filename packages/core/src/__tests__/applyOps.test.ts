import { describe, expect, it } from "vitest";
import {
  AnimatorError,
  type MotionDoc,
  type Op,
  applyOps,
  applyPatches,
} from "../index.js";

const sampleDoc: MotionDoc = {
  version: 1,
  name: "Sample Project",
  canvas: {
    width: 1080,
    height: 1080,
    fps: 30,
    duration: 5,
    background: "#000000",
  },
  params: {
    brandColor: { type: "color", value: "#FF0000", label: "Brand Color" },
  },
  assets: [],
  layers: [
    {
      id: "bg-rect",
      type: "shape",
      position: [540, 540],
      shape: { kind: "rect", size: [1080, 1080] },
      fill: "#000000",
    },
    {
      id: "header-group",
      type: "group",
      position: [540, 200],
      children: [
        {
          id: "header-text",
          type: "text",
          text: "Welcome",
          font: { family: "Inter", size: 64 },
          fill: "#FFFFFF",
        },
      ],
    },
  ],
};

describe("applyOps Reducer", () => {
  it("processes setCanvas operation", () => {
    const ops: Op[] = [
      { op: "setCanvas", set: { duration: 10, background: "#111111" } },
    ];
    const result = applyOps(sampleDoc, ops);

    expect(result.doc.canvas.duration).toBe(10);
    expect(result.doc.canvas.background).toBe("#111111");
    expect(result.patches.length).toBeGreaterThan(0);
  });

  it("adds, updates, moves, and removes layers atomically", () => {
    // 1. Add Layer to top level
    const addOp: Op = {
      op: "addLayer",
      layer: {
        id: "circle-icon",
        type: "shape",
        position: [100, 100],
        shape: { kind: "ellipse", size: [80, 80] },
        fill: "#00FF00",
      },
    };
    const res1 = applyOps(sampleDoc, [addOp]);
    expect(res1.doc.layers).toHaveLength(3);
    expect(res1.doc.layers[2]?.id).toBe("circle-icon");

    // 2. Add Layer to nested group
    const addNestedOp: Op = {
      op: "addLayer",
      layer: {
        id: "sub-icon",
        type: "shape",
        position: [0, 0],
        shape: { kind: "rect", size: [20, 20] },
      },
      parent: "header-group",
    };
    const res2 = applyOps(res1.doc, [addNestedOp]);
    const groupLayer = res2.doc.layers.find((l) => l.id === "header-group");
    expect(groupLayer?.type).toBe("group");
    if (groupLayer?.type === "group") {
      expect(groupLayer.children).toHaveLength(2);
      expect(groupLayer.children[1]?.id).toBe("sub-icon");
    }

    // 3. Update Layer
    const updateOp: Op = {
      op: "updateLayer",
      id: "header-text",
      set: { text: "Hello World", fill: "#FF00FF" },
    };
    const res3 = applyOps(res2.doc, [updateOp]);
    const updatedText = res3.doc.layers
      .flatMap((l) => (l.type === "group" ? l.children : [l]))
      .find((l) => l.id === "header-text");
    expect(updatedText?.type).toBe("text");
    if (updatedText?.type === "text") {
      expect(updatedText.text).toBe("Hello World");
      expect(updatedText.fill).toBe("#FF00FF");
    }

    // 4. Move Layer
    const moveOp: Op = {
      op: "moveLayer",
      id: "sub-icon",
      parent: null,
      index: 0,
    };
    const res4 = applyOps(res3.doc, [moveOp]);
    expect(res4.doc.layers[0]?.id).toBe("sub-icon");

    // 5. Remove Layer
    const removeOp: Op = {
      op: "removeLayer",
      id: "sub-icon",
    };
    const res5 = applyOps(res4.doc, [removeOp]);
    expect(res5.doc.layers.find((l) => l.id === "sub-icon")).toBeUndefined();
  });

  it("handles keyframes and presets operations", () => {
    const kfOp: Op = {
      op: "setKeyframes",
      id: "bg-rect",
      prop: "opacity",
      keyframes: [
        { t: 0, v: 0 },
        { t: 1, v: 100, ease: "easeOutCubic" },
      ],
    };

    const presetOp: Op = {
      op: "addPreset",
      id: "bg-rect",
      preset: { name: "fadeIn", at: 0, duration: 1 },
    };

    const res = applyOps(sampleDoc, [kfOp, presetOp]);
    const bg = res.doc.layers.find((l) => l.id === "bg-rect");
    expect(bg?.keyframes?.opacity).toHaveLength(2);
    expect(bg?.presets).toHaveLength(1);

    const removePresetOp: Op = {
      op: "removePreset",
      id: "bg-rect",
      index: 0,
    };
    const res2 = applyOps(res.doc, [removePresetOp]);
    const bg2 = res2.doc.layers.find((l) => l.id === "bg-rect");
    expect(bg2?.presets).toHaveLength(0);
  });

  it("handles params, assets, staggers, and video tracks", () => {
    const paramOp: Op = {
      op: "setParam",
      name: "accent",
      param: { type: "color", value: "#0000FF", label: "Accent" },
    };

    const assetOp: Op = {
      op: "addAsset",
      asset: {
        id: "img1",
        type: "image",
        src: "test.png",
        width: 100,
        height: 100,
      },
    };

    const staggerOp: Op = {
      op: "addStagger",
      stagger: {
        id: "stagger1",
        targets: ["bg-rect"],
        preset: "slideUp",
        at: 0.5,
        step: 0.1,
      },
    };

    const videoOp: Op = {
      op: "setVideoTrack",
      clips: [{ id: "v1", asset: "bg-video", at: 0, duration: 4 }],
    };

    const res = applyOps(sampleDoc, [paramOp, assetOp, staggerOp, videoOp]);
    expect(res.doc.params?.accent?.value).toBe("#0000FF");
    expect(res.doc.assets).toHaveLength(1);
    expect(res.doc.staggers).toHaveLength(1);
    expect(res.doc.videoTrack).toHaveLength(1);

    const removeAssetOp: Op = {
      op: "removeAsset",
      id: "img1",
    };
    const res2 = applyOps(res.doc, [removeAssetOp]);
    expect(res2.doc.assets).toHaveLength(0);
  });

  it("recovers document state exactly via undo/redo inverse patches", () => {
    const ops: Op[] = [
      {
        op: "addLayer",
        layer: {
          id: "temp-layer",
          type: "shape",
          shape: { kind: "ellipse", size: [100, 100] },
        },
      },
      {
        op: "setParam",
        name: "tempParam",
        param: { type: "text", value: "Temp", label: "Temp" },
      },
    ];

    const {
      doc: updatedDoc,
      patches,
      inversePatches,
    } = applyOps(sampleDoc, ops);
    expect(updatedDoc.layers.some((l) => l.id === "temp-layer")).toBe(true);
    expect(updatedDoc.params?.tempParam).toBeDefined();

    // Undo: Apply inverse patches
    const recoveredDoc = applyPatches(updatedDoc, inversePatches);
    expect(recoveredDoc).toEqual(sampleDoc);

    // Redo: Apply patches to recovered state
    const redoneDoc = applyPatches(recoveredDoc, patches);
    expect(redoneDoc).toEqual(updatedDoc);
  });

  it("rejects invalid operation payloads before mutation", () => {
    const malformedOp = {
      op: "addLayer",
      layer: { type: "shape" },
    } as unknown as Op;
    expect(() => applyOps(sampleDoc, [malformedOp])).toThrow(AnimatorError);
  });

  it("executes operations and validates schema in under 5 milliseconds", () => {
    const ops: Op[] = [
      {
        op: "updateLayer",
        id: "bg-rect",
        set: { opacity: 80 },
      },
      {
        op: "setCanvas",
        set: { duration: 6 },
      },
    ];

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      applyOps(sampleDoc, ops);
    }
    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / 100;

    expect(avgDuration).toBeLessThan(5);
  });
});
