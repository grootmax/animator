import { describe, expect, test } from "vitest";
import { applyOps, createDefaultDoc } from "./ops.js";
import type { Op } from "./types.js";

describe("core applyOps reducer", () => {
  test("creates default doc with initial params and layers", () => {
    const doc = createDefaultDoc();
    expect(doc.params.accent).toBeDefined();
    expect(doc.params.accent?.value).toBe("#FF5A5F");
    expect(doc.layers.length).toBeGreaterThan(0);
  });

  test("updates layer attributes and computes inverse ops", () => {
    const initialDoc = createDefaultDoc();
    const ops: Op[] = [
      {
        op: "updateLayer",
        id: "rect-1",
        set: {
          position: [600, 600],
          fill: "#00FF00",
          stroke: { color: "#000000", width: 10 },
        },
      },
    ];

    const { doc: updatedDoc, inverseOps } = applyOps(initialDoc, ops);
    const rectLayer = updatedDoc.layers.find((l) => l.id === "rect-1");
    expect(rectLayer?.position).toEqual([600, 600]);
    expect(rectLayer?.fill).toBe("#00FF00");
    expect(rectLayer?.stroke?.width).toBe(10);

    // Apply inverse ops to undo
    const { doc: undoneDoc } = applyOps(updatedDoc, inverseOps);
    const undoneRect = undoneDoc.layers.find((l) => l.id === "rect-1");
    expect(undoneRect?.position).toEqual([540, 540]);
    expect(undoneRect?.fill).toBe("{{accent}}");
    expect(undoneRect?.stroke?.width).toBe(4);
  });

  test("manages theme parameters: setParam, update, remove, and undo", () => {
    const initialDoc = createDefaultDoc();

    // Add new param
    const addOp: Op = {
      op: "setParam",
      name: "primaryColor",
      param: { type: "color", value: "#0088FF", label: "Primary Color" },
    };
    const { doc: doc1, inverseOps: inv1 } = applyOps(initialDoc, [addOp]);
    expect(doc1.params.primaryColor).toBeDefined();
    expect(doc1.params.primaryColor?.value).toBe("#0088FF");

    // Update existing param
    const updateOp: Op = {
      op: "setParam",
      name: "accent",
      param: { type: "color", value: "#123456", label: "Accent Color" },
    };
    const { doc: doc2, inverseOps: inv2 } = applyOps(doc1, [updateOp]);
    expect(doc2.params.accent?.value).toBe("#123456");

    // Remove param
    const removeOp: Op = {
      op: "setParam",
      name: "headline",
      param: null,
    };
    const { doc: doc3, inverseOps: inv3 } = applyOps(doc2, [removeOp]);
    expect(doc3.params.headline).toBeUndefined();

    // Undo removal
    const { doc: undoneDoc3 } = applyOps(doc3, inv3);
    expect(undoneDoc3.params.headline).toBeDefined();

    // Undo update
    const { doc: undoneDoc2 } = applyOps(doc2, inv2);
    expect(undoneDoc2.params.accent?.value).toBe("#FF5A5F");

    // Undo add
    const { doc: undoneDoc1 } = applyOps(doc1, inv1);
    expect(undoneDoc1.params.primaryColor).toBeUndefined();
  });
});
