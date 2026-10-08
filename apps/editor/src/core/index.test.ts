import { expect, test } from "vitest";
import { CORE_VERSION } from "./index.js";

test("core version is defined", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});
