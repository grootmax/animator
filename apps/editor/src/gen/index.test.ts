import { expect, test } from "vitest";
import { GEN_VERSION } from "./index.js";

test("gen version is defined", () => {
  expect(GEN_VERSION).toBe("0.0.0");
});
