import { expect, test } from "vitest";
import { RENDER_VERSION } from "./index.js";

test("render version is defined", () => {
  expect(RENDER_VERSION).toBe("0.0.0");
});
