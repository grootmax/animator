import { describe, expect, it } from "vitest";
import { newId } from "./id.js";

describe("newId", () => {
  it("generates a short kebab-case id without prefix", () => {
    const id = newId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("generates a kebab-case id with prefix", () => {
    const id = newId("layer");
    expect(id).toMatch(/^layer-[a-z0-9]{8}$/);
  });

  it("generates unique ids across multiple invocations", () => {
    const count = 500;
    const ids = new Set<string>();
    for (let i = 0; i < count; i++) {
      ids.add(newId("item"));
    }
    expect(ids.size).toBe(count);
  });
});
