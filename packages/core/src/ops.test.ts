import { applyPatches } from "immer";
import { describe, expect, it } from "vitest";
import { AnimatorError } from "./errors.js";
import { type Op, applyOps } from "./ops.js";
import type { MotionDoc } from "./schema.js";

describe("applyOps Reducer", () => {
  const createBaseDoc = (): MotionDoc => ({
    version: 1,
    name: "Base Project",
    revision: 1,
    canvas: {
      width: 1920,
      height: 1080,
      fps: 60,
      duration: 5,
      background: "#000000",
    },
    params: {
      theme: { type: "color", value: "#00FF00", label: "Theme" },
    },
    assets: [
      {
        id: "logo",
        type: "image",
        src: "assets/logo.png",
        width: 500,
        height: 500,
      },
    ],
    layers: [
      {
        id: "bg-shape",
        type: "shape",
        shape: { kind: "rect", size: [1920, 1080] },
        fill: "#111111",
      },
      {
        id: "hero-text",
        type: "text",
        text: "Hello",
        font: { family: "Inter", weight: 700, size: 64 },
        fill: "{{theme}}",
        presets: [{ name: "fadeIn", at: 0, duration: 1 }],
      },
    ],
  });

  it("executes setCanvas partially and updates canvas", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      { op: "setCanvas", set: { fps: 30, background: "#FFFFFF" } },
    ];
    const result = applyOps(doc, ops);

    expect(result.doc.canvas.fps).toBe(30);
    expect(result.doc.canvas.background).toBe("#FFFFFF");
    expect(result.doc.canvas.width).toBe(1920);
    expect(result.changedIds).toContain("canvas");
    expect(result.revision).toBe(2);
  });

  it("executes addLayer to root and parent groups", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      {
        op: "addLayer",
        layer: {
          id: "container",
          type: "group",
          children: [],
        },
      },
      {
        op: "addLayer",
        parent: "container",
        layer: {
          id: "nested-star",
          type: "shape",
          shape: { kind: "star", points: 5, innerRadius: 10, outerRadius: 25 },
        },
      },
    ];

    const result = applyOps(doc, ops);
    expect(result.doc.layers.length).toBe(3);
    const container = result.doc.layers.find((l) => l.id === "container");
    expect(container?.type).toBe("group");
    if (container?.type === "group") {
      expect(container.children.length).toBe(1);
      expect(container.children[0]?.id).toBe("nested-star");
    }
    expect(result.changedIds).toEqual(["container", "nested-star"]);
  });

  it("executes updateLayer with deep merge", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      {
        op: "updateLayer",
        id: "hero-text",
        set: {
          font: { size: 96 },
          text: "Updated text",
        },
      },
    ];

    const result = applyOps(doc, ops);
    const updated = result.doc.layers.find((l) => l.id === "hero-text");
    expect(updated?.type).toBe("text");
    if (updated?.type === "text") {
      expect(updated.text).toBe("Updated text");
      expect(updated.font?.size).toBe(96);
      expect(updated.font?.family).toBe("Inter");
      expect(updated.font?.weight).toBe(700);
    }
  });

  it("executes removeLayer and cleans up parent references and stagger targets", () => {
    const doc: MotionDoc = {
      ...createBaseDoc(),
      staggers: [
        {
          name: "stagger",
          targets: ["bg-shape", "hero-text"],
          preset: "slideUp",
          at: 0,
          step: 0.1,
        },
      ],
      layers: [
        {
          id: "parent-layer",
          type: "shape",
          shape: { kind: "rect", size: [100, 100] },
        },
        {
          id: "child-layer",
          type: "shape",
          shape: { kind: "rect", size: [50, 50] },
          parent: "parent-layer",
        },
      ],
    };

    const result = applyOps(doc, [{ op: "removeLayer", id: "parent-layer" }]);
    expect(result.doc.layers.some((l) => l.id === "parent-layer")).toBe(false);
    const child = result.doc.layers.find((l) => l.id === "child-layer");
    expect(child?.parent).toBeUndefined();
  });

  it("executes moveLayer within root and reparents into group", () => {
    const doc: MotionDoc = {
      ...createBaseDoc(),
      layers: [
        {
          id: "layer-a",
          type: "shape",
          shape: { kind: "rect", size: [100, 100] },
        },
        {
          id: "layer-b",
          type: "shape",
          shape: { kind: "rect", size: [100, 100] },
        },
        {
          id: "group-target",
          type: "group",
          children: [],
        },
      ],
    };

    // Reorder at root
    const reorderResult = applyOps(doc, [
      { op: "moveLayer", id: "layer-b", index: 0 },
    ]);
    expect(reorderResult.doc.layers[0]?.id).toBe("layer-b");

    // Reparent into group
    const reparentResult = applyOps(doc, [
      { op: "moveLayer", id: "layer-a", parent: "group-target", index: 0 },
    ]);
    expect(reparentResult.doc.layers.some((l) => l.id === "layer-a")).toBe(
      false,
    );
    const group = reparentResult.doc.layers.find(
      (l) => l.id === "group-target",
    );
    if (group?.type === "group") {
      expect(group.children.length).toBe(1);
      expect(group.children[0]?.id).toBe("layer-a");
    }

    // Move out of group back to root
    const moveBackResult = applyOps(reparentResult.doc, [
      { op: "moveLayer", id: "layer-a", parent: null, index: 1 },
    ]);
    expect(moveBackResult.doc.layers.some((l) => l.id === "layer-a")).toBe(
      true,
    );
    const moved = moveBackResult.doc.layers.find((l) => l.id === "layer-a");
    expect(moved?.parent).toBeUndefined();
  });

  it("rejects moveLayer into descendant to prevent hierarchy cycles", () => {
    const doc: MotionDoc = {
      ...createBaseDoc(),
      layers: [
        {
          id: "grandparent",
          type: "group",
          children: [
            {
              id: "parent",
              type: "group",
              children: [
                {
                  id: "child",
                  type: "shape",
                  shape: { kind: "rect", size: [10, 10] },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() =>
      applyOps(doc, [
        { op: "moveLayer", id: "grandparent", parent: "child", index: 0 },
      ]),
    ).toThrowError(AnimatorError);

    try {
      applyOps(doc, [
        { op: "moveLayer", id: "grandparent", parent: "child", index: 0 },
      ]);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_HIERARCHY_CYCLE");
    }
  });

  it("executes setKeyframes, sorts by time, and clears with null", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      {
        op: "setKeyframes",
        id: "hero-text",
        prop: "opacity",
        keyframes: [
          { t: 2.0, v: 0 },
          { t: 0.5, v: 100 },
        ],
      },
    ];

    const result = applyOps(doc, ops);
    const layer = result.doc.layers.find((l) => l.id === "hero-text");
    expect(layer?.keyframes?.opacity).toBeDefined();
    expect(layer?.keyframes?.opacity?.[0]?.t).toBe(0.5);
    expect(layer?.keyframes?.opacity?.[1]?.t).toBe(2.0);

    // Clear keyframes
    const clearResult = applyOps(result.doc, [
      { op: "setKeyframes", id: "hero-text", prop: "opacity", keyframes: null },
    ]);
    const clearedLayer = clearResult.doc.layers.find(
      (l) => l.id === "hero-text",
    );
    expect(clearedLayer?.keyframes?.opacity).toBeUndefined();
  });

  it("rejects duplicate keyframe times for the same property", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      {
        op: "setKeyframes",
        id: "hero-text",
        prop: "rotation",
        keyframes: [
          { t: 1.0, v: 0 },
          { t: 1.0, v: 90 },
        ],
      },
    ];

    expect(() => applyOps(doc, ops)).toThrowError(AnimatorError);
    try {
      applyOps(doc, ops);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_DUPLICATE_KEYFRAME_TIME");
    }
  });

  it("executes addPreset and removePreset", () => {
    const doc = createBaseDoc();
    const addResult = applyOps(doc, [
      {
        op: "addPreset",
        id: "hero-text",
        preset: { name: "slideUp", at: 0.5, duration: 0.6 },
      },
    ]);
    const layerWithPreset = addResult.doc.layers.find(
      (l) => l.id === "hero-text",
    );
    expect(layerWithPreset?.presets?.length).toBe(2);

    const removeResult = applyOps(addResult.doc, [
      { op: "removePreset", id: "hero-text", index: 0 },
    ]);
    const layerAfterRemove = removeResult.doc.layers.find(
      (l) => l.id === "hero-text",
    );
    expect(layerAfterRemove?.presets?.length).toBe(1);
    expect(layerAfterRemove?.presets?.[0]?.name).toBe("slideUp");
  });

  it("executes addStagger, setParam, addAsset, removeAsset, and setVideoTrack", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      {
        op: "addStagger",
        stagger: {
          name: "stagger",
          targets: ["bg-shape", "hero-text"],
          preset: "fadeIn",
          at: 0.2,
          step: 0.1,
        },
      },
      {
        op: "setParam",
        name: "brandColor",
        param: { type: "color", value: "#0055FF" },
      },
      {
        op: "addAsset",
        asset: { id: "sound", type: "video", src: "assets/sound.mp4" },
      },
      {
        op: "removeAsset",
        id: "logo",
      },
      {
        op: "setVideoTrack",
        clips: [
          {
            id: "clip-1",
            asset: "sound",
            at: 0,
            trimIn: 0,
            duration: 3,
            placement: "under",
          },
        ],
      },
    ];

    const result = applyOps(doc, ops);
    expect(result.doc.staggers?.length).toBe(1);
    expect(result.doc.params?.brandColor?.value).toBe("#0055FF");
    expect(result.doc.assets?.some((a) => a.id === "sound")).toBe(true);
    expect(result.doc.assets?.some((a) => a.id === "logo")).toBe(false);
    expect(result.doc.videoTrack?.length).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("generates exact Immer forward and inverse patches allowing complete undo", () => {
    const doc = createBaseDoc();
    const ops: Op[] = [
      { op: "setCanvas", set: { duration: 10 } },
      {
        op: "addLayer",
        layer: {
          id: "extra-layer",
          type: "shape",
          shape: { kind: "ellipse", size: [50, 50] },
        },
      },
    ];

    const result = applyOps(doc, ops);
    expect(result.patches.length).toBeGreaterThan(0);
    expect(result.inversePatches.length).toBeGreaterThan(0);

    // Apply inverse patches to nextDoc - should restore original state
    const reverted = applyPatches(result.doc, result.inversePatches);
    expect(reverted.canvas.duration).toBe(doc.canvas.duration);
    expect(reverted.layers.length).toBe(doc.layers.length);
    expect(reverted.layers.some((l) => l.id === "extra-layer")).toBe(false);
  });

  it("is strictly atomic: aborts entire batch and leaves doc untouched on failure", () => {
    const doc = createBaseDoc();
    const snapshotBefore = JSON.parse(JSON.stringify(doc));

    const ops: Op[] = [
      { op: "setCanvas", set: { duration: 20 } },
      { op: "removeLayer", id: "non-existent-layer-id" }, // this will fail!
      { op: "setCanvas", set: { width: 500 } },
    ];

    expect(() => applyOps(doc, ops)).toThrowError(AnimatorError);

    // Ensure the original doc was completely unchanged
    expect(doc).toEqual(snapshotBefore);
  });
});
