import { describe, expect, test } from "vitest";
import type { LayerNode } from "./types.js";
import { validateDocOverlaps, validateNodeOverlaps } from "./validator.js";

describe("Overlap Validator Engine", () => {
  test("non-overlapping preset windows pass validation cleanly", () => {
    const node: LayerNode = {
      id: "title",
      presets: [
        { name: "fadeIn", at: 0.2, duration: 0.5 }, // opacity: 0.2s - 0.7s
        { name: "fadeOut", at: 3.4, duration: 0.4 }, // opacity: 3.4s - 3.8s
      ],
    };

    const res = validateNodeOverlaps(node);
    expect(res.valid).toBe(true);
    expect(res.collisions).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
  });

  test("presets animating different properties at overlapping times pass validation", () => {
    const node: LayerNode = {
      id: "headline",
      presets: [
        { name: "fadeIn", at: 0.2, duration: 0.5 }, // opacity: 0.2s - 0.7s
        { name: "slideUp", at: 0.2, duration: 0.6 }, // position: 0.2s - 0.8s
      ],
    };

    const res = validateNodeOverlaps(node);
    expect(res.valid).toBe(true);
    expect(res.collisions).toHaveLength(0);
  });

  test("boundary touching preset windows pass validation", () => {
    const node: LayerNode = {
      id: "box",
      presets: [
        { name: "fadeIn", at: 0.0, duration: 1.0 }, // opacity: 0.0s - 1.0s
        { name: "fadeOut", at: 1.0, duration: 0.5 }, // opacity: 1.0s - 1.5s
      ],
    };

    const res = validateNodeOverlaps(node);
    expect(res.valid).toBe(true);
    expect(res.collisions).toHaveLength(0);
  });

  test("overlapping property time windows on the same node generate validation errors and diagnostic reports", () => {
    const node: LayerNode = {
      id: "heroText",
      presets: [
        { name: "fadeIn", at: 0.2, duration: 0.6 }, // opacity: 0.2s - 0.8s
        { name: "fadeOut", at: 0.5, duration: 0.5 }, // opacity: 0.5s - 1.0s
      ],
    };

    const res = validateNodeOverlaps(node);
    expect(res.valid).toBe(false);
    expect(res.collisions).toHaveLength(1);

    const collision = res.collisions[0];
    expect(collision).toBeDefined();
    expect(collision?.nodeId).toBe("heroText");
    expect(collision?.property).toBe("opacity");
    expect(collision?.overlapWindow).toEqual({ start: 0.5, end: 0.8 });
    expect(collision?.presetA.name).toBe("fadeIn");
    expect(collision?.presetB.name).toBe("fadeOut");
    expect(collision?.message).toContain("Property collision detected");
    expect(collision?.hint).toContain("Adjust timing");

    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.code).toBe("PROPERTY_OVERLAP");
    expect(res.errors[0]?.path).toBe("layers[heroText].presets");
  });

  test("validateDocOverlaps validates all layers in a document and executes in sub-millisecond time", () => {
    const doc = {
      layers: [
        {
          id: "node1",
          presets: [
            { name: "pop", at: 0.1, duration: 0.5 }, // scale: 0.1s - 0.6s
            { name: "pulse", at: 0.4, duration: 0.5 }, // scale: 0.4s - 0.9s
          ],
        },
        {
          id: "node2",
          presets: [{ name: "drawOn", at: 0.0, duration: 1.0 }],
        },
      ],
    };

    const start = performance.now();
    const res = validateDocOverlaps(doc);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10); // sub-millisecond execution target
    expect(res.valid).toBe(false);
    expect(res.collisions).toHaveLength(1);
    expect(res.collisions[0]?.nodeId).toBe("node1");
    expect(res.collisions[0]?.property).toBe("scale");
    expect(res.collisions[0]?.overlapWindow).toEqual({ start: 0.4, end: 0.6 });
  });
});
