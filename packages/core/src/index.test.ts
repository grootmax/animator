import { expect, test } from "vitest";
import { CORE_VERSION, applyOps, createDefaultDoc } from "./index.js";

test("core version is defined", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});

test("applyOps performs document mutations atomically", () => {
  const doc = createDefaultDoc("Test Project");
  expect(doc.revision).toBe(0);
  expect(doc.layers).toHaveLength(0);

  const res = applyOps(doc, [
    {
      op: "addLayer",
      layer: {
        id: "title",
        type: "text",
        text: "Hello World",
        position: [540, 540],
      },
    },
    {
      op: "updateLayer",
      id: "title",
      set: { opacity: 80 },
    },
  ]);

  expect(res.revision).toBe(1);
  expect(res.doc.layers).toHaveLength(1);
  expect(res.doc.layers[0]?.id).toBe("title");
  expect(res.doc.layers[0]?.opacity).toBe(80);
  expect(res.changedIds).toEqual(["title"]);
  expect(res.warnings).toHaveLength(0);
});
