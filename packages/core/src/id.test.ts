import { beforeEach, describe, expect, it } from "vitest";
import { newId, resetIdCounter } from "./id.js";

describe("newId", () => {
  beforeEach(() => {
    resetIdCounter(0);
  });

  it("generates deterministic sequential kebab-case IDs with default prefix", () => {
    expect(newId()).toBe("id-1");
    expect(newId()).toBe("id-2");
    expect(newId()).toBe("id-3");
  });

  it("generates IDs with custom prefixes", () => {
    expect(newId("layer")).toBe("layer-1");
    expect(newId("layer")).toBe("layer-2");
    expect(newId("shape-rect")).toBe("shape-rect-3");
  });

  it("sanitizes prefixes into kebab-case", () => {
    expect(newId("My Custom Layer")).toBe("my-custom-layer-1");
    expect(newId("---bad___prefix---")).toBe("bad-prefix-2");
    expect(newId("")).toBe("id-3");
  });

  it("supports explicit seed for deterministic reproducibility", () => {
    expect(newId("title", 42)).toBe("title-42");
    expect(newId("button", "ok")).toBe("button-ok");
  });

  it("resets counter with resetIdCounter", () => {
    expect(newId("test")).toBe("test-1");
    resetIdCounter(10);
    expect(newId("test")).toBe("test-11");
  });

  it("matches kebab-case pattern", () => {
    const id = newId("hero-element");
    expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)).toBe(true);
  });
});
