import { applyPatches } from "immer";
import { describe, expect, it } from "vitest";
import { AnimatorError } from "./errors.js";
import { applyOps } from "./ops.js";
import type { MotionDoc } from "./schema.js";

function createBaseDoc(): MotionDoc {
  return {
    version: 1,
    name: "Test Doc",
    revision: 1,
    canvas: {
      width: 1080,
      height: 1080,
      fps: 30,
      duration: 4,
      background: "#0B1020",
    },
    params: {
      accent: { type: "color", value: "#FF5A5F" },
    },
    assets: [{ id: "hero", type: "image", src: "assets/hero.png" }],
    layers: [
      {
        id: "layer-bg",
        type: "shape",
        shape: { kind: "rect", size: [1080, 1080] },
        fill: "#0B1020",
      },
      {
        id: "group-1",
        type: "group",
        children: [
          {
            id: "child-1",
            type: "text",
            text: "Hello",
            font: { family: "Inter", size: 32 },
          },
        ],
      },
    ],
    videoTrack: [],
  };
}

describe("applyOps", () => {
  describe("Canvas mutations", () => {
    it("applies setCanvas op and updates canvas", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        { op: "setCanvas", set: { width: 1920, height: 1080, fps: 60 } },
      ]);

      expect(result.doc.canvas.width).toBe(1920);
      expect(result.doc.canvas.height).toBe(1080);
      expect(result.doc.canvas.fps).toBe(60);
      expect(result.doc.canvas.duration).toBe(4);
      expect(result.revision).toBe(2);
    });

    it("rejects invalid non-positive canvas dimensions", () => {
      const doc = createBaseDoc();
      expect(() =>
        applyOps(doc, [{ op: "setCanvas", set: { width: -10 } }]),
      ).toThrowError(AnimatorError);
    });
  });

  describe("Layer additions & removals", () => {
    it("adds a layer at the root level", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        {
          op: "addLayer",
          layer: {
            id: "title-layer",
            type: "text",
            text: "Welcome",
          },
        },
      ]);

      expect(result.doc.layers.length).toBe(3);
      expect(result.doc.layers[2]?.id).toBe("title-layer");
      expect(result.changedIds).toContain("title-layer");
    });

    it("adds a layer to a parent group", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        {
          op: "addLayer",
          parent: "group-1",
          layer: {
            id: "child-2",
            type: "shape",
            shape: { kind: "ellipse", size: [50, 50] },
          },
        },
      ]);

      const group = result.doc.layers.find((l) => l.id === "group-1");
      expect(group?.type).toBe("group");
      if (group?.type === "group") {
        expect(group.children?.length).toBe(2);
        expect(group.children?.[1]?.id).toBe("child-2");
        expect(group.children?.[1]?.parent).toBe("group-1");
      }
      expect(result.changedIds).toContain("child-2");
    });

    it("rejects adding a layer with duplicate ID", () => {
      const doc = createBaseDoc();
      expect(() =>
        applyOps(doc, [
          {
            op: "addLayer",
            layer: { id: "child-1", type: "text", text: "Duplicate" },
          },
        ]),
      ).toThrowError(AnimatorError);
    });

    it("removes a layer from root", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [{ op: "removeLayer", id: "layer-bg" }]);
      expect(result.doc.layers.some((l) => l.id === "layer-bg")).toBe(false);
      expect(result.changedIds).toContain("layer-bg");
    });

    it("removes a layer from inside a group", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [{ op: "removeLayer", id: "child-1" }]);
      const group = result.doc.layers.find((l) => l.id === "group-1");
      if (group?.type === "group") {
        expect(group.children?.some((c) => c.id === "child-1")).toBe(false);
      }
      expect(result.changedIds).toContain("child-1");
    });

    it("throws when removing a non-existent layer", () => {
      const doc = createBaseDoc();
      expect(() =>
        applyOps(doc, [{ op: "removeLayer", id: "missing-layer" }]),
      ).toThrowError(AnimatorError);
    });
  });

  describe("Layer updates & moves", () => {
    it("deep merges properties into a layer", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        {
          op: "updateLayer",
          id: "child-1",
          set: {
            font: { size: 64 },
            opacity: 80,
          },
        },
      ]);

      const group = result.doc.layers.find((l) => l.id === "group-1");
      if (group?.type === "group") {
        const child = group.children?.find((c) => c.id === "child-1");
        expect(child?.type).toBe("text");
        if (child?.type === "text") {
          expect(child.font?.size).toBe(64);
          expect(child.font?.family).toBe("Inter");
          expect(child.opacity).toBe(80);
        }
      }
    });

    it("moves a layer from group to root", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        { op: "moveLayer", id: "child-1", parent: null, index: 0 },
      ]);

      expect(result.doc.layers[0]?.id).toBe("child-1");
      expect(result.doc.layers[0]?.parent).toBeUndefined();
      const group = result.doc.layers.find((l) => l.id === "group-1");
      if (group?.type === "group") {
        expect(group.children?.length).toBe(0);
      }
    });

    it("rejects circular moves where a group is moved into its descendant", () => {
      const doc = createBaseDoc();
      // Add nested group inside group-1
      const res1 = applyOps(doc, [
        {
          op: "addLayer",
          parent: "group-1",
          layer: { id: "subgroup", type: "group", children: [] },
        },
      ]);

      expect(() =>
        applyOps(res1.doc, [
          { op: "moveLayer", id: "group-1", parent: "subgroup", index: 0 },
        ]),
      ).toThrowError(AnimatorError);
    });
  });

  describe("Keyframe mutations", () => {
    it("sets, sorts, and replaces keyframes", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        {
          op: "setKeyframes",
          id: "layer-bg",
          prop: "opacity",
          keyframes: [
            { t: 1.0, v: 100 },
            { t: 0.2, v: 0 },
          ],
        },
      ]);

      const layer = result.doc.layers.find((l) => l.id === "layer-bg");
      expect(layer?.keyframes?.opacity).toEqual([
        { t: 0.2, v: 0 },
        { t: 1.0, v: 100 },
      ]);
    });

    it("removes keyframes when null is passed", () => {
      const doc = createBaseDoc();
      const res1 = applyOps(doc, [
        {
          op: "setKeyframes",
          id: "layer-bg",
          prop: "opacity",
          keyframes: [{ t: 0, v: 100 }],
        },
      ]);
      const res2 = applyOps(res1.doc, [
        {
          op: "setKeyframes",
          id: "layer-bg",
          prop: "opacity",
          keyframes: null,
        },
      ]);

      const layer = res2.doc.layers.find((l) => l.id === "layer-bg");
      expect(layer?.keyframes?.opacity).toBeUndefined();
    });

    it("rejects duplicate keyframes on the same frame", () => {
      const doc = createBaseDoc();
      // At 30 fps, t=0.01 and t=0.02 both map to frame 0
      expect(() =>
        applyOps(doc, [
          {
            op: "setKeyframes",
            id: "layer-bg",
            prop: "opacity",
            keyframes: [
              { t: 0, v: 0 },
              { t: 0.01, v: 50 },
            ],
          },
        ]),
      ).toThrowError(AnimatorError);
    });
  });

  describe("Presets & Staggers", () => {
    it("adds and removes presets", () => {
      const doc = createBaseDoc();
      const res1 = applyOps(doc, [
        {
          op: "addPreset",
          id: "layer-bg",
          preset: { name: "fadeIn", at: 0.5, duration: 0.5 },
        },
      ]);
      const layer1 = res1.doc.layers.find((l) => l.id === "layer-bg");
      expect(layer1?.presets?.length).toBe(1);

      const res2 = applyOps(res1.doc, [
        { op: "removePreset", id: "layer-bg", index: 0 },
      ]);
      const layer2 = res2.doc.layers.find((l) => l.id === "layer-bg");
      expect(layer2?.presets?.length).toBe(0);
    });

    it("throws on removePreset with out-of-bounds index", () => {
      const doc = createBaseDoc();
      expect(() =>
        applyOps(doc, [{ op: "removePreset", id: "layer-bg", index: 5 }]),
      ).toThrowError(AnimatorError);
    });

    it("adds stagger and produces warnings for missing targets", () => {
      const doc = createBaseDoc();
      const result = applyOps(doc, [
        {
          op: "addStagger",
          stagger: {
            targets: ["layer-bg", "non-existent"],
            preset: "slideUp",
            at: 0.2,
            step: 0.1,
          },
        },
      ]);

      expect(result.doc.staggers?.length).toBe(1);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain("non-existent");
      expect(result.changedIds).toEqual(
        expect.arrayContaining(["layer-bg", "non-existent"]),
      );
    });
  });

  describe("Params, Assets & VideoTrack", () => {
    it("sets and deletes params", () => {
      const doc = createBaseDoc();
      const res1 = applyOps(doc, [
        {
          op: "setParam",
          name: "headline",
          param: { type: "text", value: "New Title" },
        },
      ]);
      expect(res1.doc.params?.headline?.value).toBe("New Title");

      const res2 = applyOps(res1.doc, [
        { op: "setParam", name: "accent", param: null },
      ]);
      expect(res2.doc.params?.accent).toBeUndefined();
    });

    it("adds and removes assets", () => {
      const doc = createBaseDoc();
      const res1 = applyOps(doc, [
        {
          op: "addAsset",
          asset: { id: "new-logo", type: "image", src: "logo.png" },
        },
      ]);
      expect(res1.doc.assets?.some((a) => a.id === "new-logo")).toBe(true);

      const res2 = applyOps(res1.doc, [{ op: "removeAsset", id: "new-logo" }]);
      expect(res2.doc.assets?.some((a) => a.id === "new-logo")).toBe(false);
    });

    it("rejects duplicate asset IDs", () => {
      const doc = createBaseDoc();
      expect(() =>
        applyOps(doc, [
          {
            op: "addAsset",
            asset: { id: "hero", type: "image", src: "dup.png" },
          },
        ]),
      ).toThrowError(AnimatorError);
    });

    it("sets video track and catches duplicate clip IDs", () => {
      const doc = createBaseDoc();
      const res = applyOps(doc, [
        {
          op: "setVideoTrack",
          clips: [
            { id: "c1", asset: "hero", at: 0, duration: 2 },
            { id: "c2", asset: "hero", at: 2, duration: 2 },
          ],
        },
      ]);
      expect(res.doc.videoTrack?.length).toBe(2);

      expect(() =>
        applyOps(doc, [
          {
            op: "setVideoTrack",
            clips: [
              { id: "c1", asset: "hero", at: 0, duration: 2 },
              { id: "c1", asset: "hero", at: 2, duration: 2 },
            ],
          },
        ]),
      ).toThrowError(AnimatorError);
    });
  });

  describe("Atomicity & Rollback", () => {
    it("ensures zero modifications are applied to original doc when any operation in a batch fails", () => {
      const originalDoc = createBaseDoc();
      const snapshot = JSON.parse(JSON.stringify(originalDoc));

      const ops = [
        {
          op: "setCanvas" as const,
          set: { width: 3840 },
        },
        {
          op: "addLayer" as const,
          layer: { id: "temp-layer", type: "text" as const, text: "Temp" },
        },
        // This 3rd op fails
        {
          op: "updateLayer" as const,
          id: "missing-target-layer",
          set: { opacity: 50 },
        },
        {
          op: "setCanvas" as const,
          set: { height: 2160 },
        },
      ];

      expect(() => applyOps(originalDoc, ops)).toThrowError(AnimatorError);

      // Verify originalDoc is completely unmodified
      expect(originalDoc).toEqual(snapshot);
      expect(originalDoc.canvas.width).toBe(1080);
      expect(originalDoc.layers.length).toBe(2);
      expect(originalDoc.revision).toBe(1);
    });
  });

  describe("Inverse patches and undo", () => {
    it("produces inverse patches that can fully revert the document state using applyPatches", () => {
      const doc = createBaseDoc();
      const snapshot = JSON.parse(JSON.stringify(doc));

      const result = applyOps(doc, [
        { op: "setCanvas", set: { width: 1920 } },
        {
          op: "addLayer",
          layer: {
            id: "box",
            type: "shape",
            shape: { kind: "rect", size: [100, 100] },
          },
        },
        {
          op: "setParam",
          name: "theme",
          param: { type: "text", value: "dark" },
        },
      ]);

      expect(result.doc.canvas.width).toBe(1920);
      expect(result.doc.layers.length).toBe(3);

      // Apply inverse patches to result.doc
      const reverted = applyPatches(result.doc, result.inversePatches);

      // Reverted document should match the original snapshot
      expect(reverted).toEqual(snapshot);
    });
  });
});
