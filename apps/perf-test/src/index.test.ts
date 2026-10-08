import { describe, expect, it } from "vitest";
import { PERF_TEST_VERSION } from "./index.js";

describe("perf-test", () => {
  it("exports version", () => {
    expect(PERF_TEST_VERSION).toBe("0.0.0");
  });
});
