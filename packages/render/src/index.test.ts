import { createDefaultDoc } from "@animator/core";
import { expect, test } from "vitest";
import { RENDER_VERSION, renderPreview } from "./index.js";

test("render version is defined", () => {
  expect(RENDER_VERSION).toBe("0.0.0");
});

test("renderPreview returns contact sheet frames", async () => {
  const doc = createDefaultDoc("Render Test");
  const result = await renderPreview(doc, { count: 3, size: 256 });

  expect(result.frameCount).toBe(3);
  expect(result.frames).toHaveLength(3);
  expect(result.frames[0]?.width).toBe(256);
  expect(result.frames[0]?.dataUrl).toContain("data:image/png");
});
