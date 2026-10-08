import { expect, test } from "vitest";
import {
  AnimatorError,
  CORE_VERSION,
  type MotionDoc,
  type Op,
  applyOps,
} from "./index.js";

const initialDoc: MotionDoc = {
  formatVersion: 1,
  revision: 0,
  canvas: { width: 1080, height: 1080, fps: 30, duration: 4 },
  layers: [
    {
      id: "layer-1",
      type: "shape",
      name: "Background",
      position: [540, 540],
      opacity: 100,
    },
  ],
};

test("core version is defined", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});

test("applyOps setCanvas updates canvas and returns inverse patch", () => {
  const ops: Op[] = [{ op: "setCanvas", set: { width: 1920, height: 1080 } }];
  const result = applyOps(initialDoc, ops);

  expect(result.doc.canvas.width).toBe(1920);
  expect(result.doc.canvas.height).toBe(1080);
  expect(result.doc.revision).toBe(1);

  // Apply inverse patch
  const undone = applyOps(result.doc, result.inversePatches);
  expect(undone.doc.canvas.width).toBe(1080);
  expect(undone.doc.canvas.height).toBe(1080);
});

test("applyOps addLayer and removeLayer", () => {
  const addOp: Op = {
    op: "addLayer",
    layer: { id: "layer-2", type: "text", name: "Title" },
    index: 1,
  };
  const result = applyOps(initialDoc, [addOp]);

  expect(result.doc.layers).toHaveLength(2);
  expect(result.doc.layers[1]?.id).toBe("layer-2");
  expect(result.changedIds).toEqual(["layer-2"]);

  const removeOp: Op = { op: "removeLayer", id: "layer-2" };
  const result2 = applyOps(result.doc, [removeOp]);
  expect(result2.doc.layers).toHaveLength(1);
  expect(result2.changedIds).toEqual(["layer-2"]);
});

test("applyOps batch updateLayer and moveLayer", () => {
  const ops: Op[] = [
    {
      op: "addLayer",
      layer: { id: "layer-2", type: "image", name: "Logo" },
    },
    {
      op: "updateLayer",
      id: "layer-1",
      set: { opacity: 80, position: [100, 200] },
    },
    {
      op: "moveLayer",
      id: "layer-2",
      index: 0,
    },
  ];

  const result = applyOps(initialDoc, ops);
  expect(result.doc.layers[0]?.id).toBe("layer-2");
  expect(result.doc.layers[1]?.opacity).toBe(80);
  expect(result.doc.layers[1]?.position).toEqual([100, 200]);
  expect(result.changedIds.sort()).toEqual(["layer-1", "layer-2"]);

  // Test undoing batch via inverse patches
  const undone = applyOps(result.doc, result.inversePatches);
  expect(undone.doc.layers).toHaveLength(1);
  expect(undone.doc.layers[0]?.id).toBe("layer-1");
  expect(undone.doc.layers[0]?.opacity).toBe(100);
});

test("applyOps setKeyframes and presets", () => {
  const ops: Op[] = [
    {
      op: "setKeyframes",
      id: "layer-1",
      prop: "opacity",
      keyframes: [
        { t: 0, v: 0 },
        { t: 1, v: 100, ease: "easeOutExpo" },
      ],
    },
    {
      op: "addPreset",
      id: "layer-1",
      preset: { name: "fadeIn", at: 0, duration: 1 },
    },
  ];

  const result = applyOps(initialDoc, ops);
  const layer = result.doc.layers[0];
  expect(layer?.keyframes?.opacity).toHaveLength(2);
  expect(layer?.presets).toHaveLength(1);
  expect(layer?.presets?.[0]?.name).toBe("fadeIn");

  const removePresetOp: Op = { op: "removePreset", id: "layer-1", index: 0 };
  const result2 = applyOps(result.doc, [removePresetOp]);
  expect(result2.doc.layers[0]?.presets).toHaveLength(0);
});

test("applyOps params, assets, and videoTrack", () => {
  const ops: Op[] = [
    {
      op: "setParam",
      name: "accent",
      param: { type: "color", value: "#FF0000" },
    },
    {
      op: "addAsset",
      asset: { id: "bg-img", type: "image", src: "data:image/png;base64,..." },
    },
    {
      op: "setVideoTrack",
      clips: [{ id: "clip-1", asset: "bg-video", at: 0, duration: 4 }],
    },
  ];

  const result = applyOps(initialDoc, ops);
  expect(result.doc.params?.accent?.value).toBe("#FF0000");
  expect(result.doc.assets?.[0]?.id).toBe("bg-img");
  expect(result.doc.videoTrack?.[0]?.id).toBe("clip-1");

  const undone = applyOps(result.doc, result.inversePatches);
  expect(undone.doc.params?.accent).toBeUndefined();
  expect(undone.doc.assets).toHaveLength(0);
  expect(undone.doc.videoTrack).toHaveLength(0);
});

test("applyOps throws STALE_REVISION on baseRevision mismatch", () => {
  const ops: Op[] = [{ op: "setCanvas", set: { fps: 60 } }];
  expect(() => applyOps(initialDoc, ops, { baseRevision: 99 })).toThrowError(
    AnimatorError,
  );
});

test("applyOps throws AnimatorError on invalid layer id target", () => {
  const ops: Op[] = [
    { op: "updateLayer", id: "non-existent", set: { opacity: 50 } },
  ];
  expect(() => applyOps(initialDoc, ops)).toThrowError(AnimatorError);
});
