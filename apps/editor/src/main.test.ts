import { describe, expect, test } from "vitest";
import { App } from "./main.js";

describe("Editor Application", () => {
  test("App function component exists", () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe("function");
  });
});
