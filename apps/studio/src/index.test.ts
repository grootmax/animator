import { expect, test } from "vitest";
import { STUDIO_VERSION } from "./index.js";

test("studio version is defined", () => {
  expect(STUDIO_VERSION).toBe("0.0.0");
});
