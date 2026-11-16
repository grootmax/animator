import { describe, expect, test } from "vitest";
import {
  CORE_VERSION,
  applyOps,
  compileToLottie,
  createDefaultMotionDoc,
} from "./index.js";

test("core version is defined", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});

describe("applyOps", () => {
  test("applies setCanvas op atomically", () => {
    const doc = createDefaultMotionDoc();
    const result = applyOps(doc, [
      { op: "setCanvas", set: { width: 1200, duration: 5 } },
    ]);
    expect(result.doc.canvas.width).toBe(1200);
    expect(result.doc.canvas.duration).toBe(5);
    expect(result.revision).toBe(1);
    expect(doc.canvas.width).toBe(600); // Original is unchanged
  });

  test("applies addLayer, updateLayer, removeLayer, moveLayer ops", () => {
    const doc = createDefaultMotionDoc();
    const addResult = applyOps(doc, [
      {
        op: "addLayer",
        layer: {
          id: "star-layer",
          type: "shape",
          fill: "#FFD600",
        },
      },
    ]);
    expect(addResult.doc.layers.length).toBe(3);
    expect(addResult.changedIds).toContain("star-layer");

    const updateResult = applyOps(addResult.doc, [
      {
        op: "updateLayer",
        id: "star-layer",
        set: { fill: "#FFFFFF" },
      },
    ]);
    const updated = updateResult.doc.layers.find((l) => l.id === "star-layer");
    expect(updated?.fill).toBe("#FFFFFF");

    const moveResult = applyOps(updateResult.doc, [
      {
        op: "moveLayer",
        id: "star-layer",
        index: 0,
      },
    ]);
    expect(moveResult.doc.layers[0]?.id).toBe("star-layer");

    const removeResult = applyOps(moveResult.doc, [
      {
        op: "removeLayer",
        id: "star-layer",
      },
    ]);
    expect(removeResult.doc.layers.length).toBe(2);
    expect(
      removeResult.doc.layers.some((l) => l.id === "star-layer"),
    ).toBeFalsy();
  });

  test("rejects invalid ops and maintains atomicity", () => {
    const doc = createDefaultMotionDoc();
    expect(() =>
      applyOps(doc, [
        { op: "updateLayer", id: "non-existent", set: { fill: "#000000" } },
      ]),
    ).toThrow("not found");
  });
});

describe("compileToLottie", () => {
  test("compiles MotionDoc to valid Lottie JSON structure", () => {
    const doc = createDefaultMotionDoc();
    const lottie = compileToLottie(doc);

    expect(lottie.v).toBe("5.7.0");
    expect(lottie.w).toBe(600);
    expect(lottie.h).toBe(400);
    expect(lottie.fr).toBe(30);
    expect(lottie.op).toBe(90); // 3 sec * 30 fps

    const layers = lottie.layers as Array<Record<string, unknown>>;
    expect(layers.length).toBe(2);
    expect(layers[0]?.ty).toBe(4); // shape layer
    expect(layers[0]?.ks).toBeDefined();
    expect(layers[0]?.shapes).toBeDefined();
  });
});
