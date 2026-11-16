import { expect, test } from "vitest";
import { RENDER_VERSION, getCanvasKit } from "./index.js";

test("render version is defined", () => {
  expect(RENDER_VERSION).toBe("0.0.0");
});

test("getCanvasKit returns a singleton instance", async () => {
  const ck1 = await getCanvasKit();
  const ck2 = await getCanvasKit();
  expect(ck1).toBeDefined();
  expect(ck1).toBe(ck2);
  expect(typeof ck1.MakeManagedAnimation).toBe("function");
});
