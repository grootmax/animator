import { describe, expect, test } from "vitest";
import {
  getTemplatePath,
  listTemplates,
  loadTemplate,
  parseTemplate,
} from "../src/index.js";

describe("templates utility", () => {
  test("listTemplates returns expected starter templates", async () => {
    const templates = await listTemplates();
    expect(templates).toContain("title-card");
    expect(templates).toContain("logo-reveal");
    expect(templates).toContain("lower-third");
    expect(templates).toContain("loader");
  });

  test("getTemplatePath resolves valid file paths", () => {
    const titleCardPath = getTemplatePath("title-card");
    expect(titleCardPath).toMatch(/templates\/title-card\.motion\.json$/);

    const logoRevealPath = getTemplatePath("logo-reveal.motion.json");
    expect(logoRevealPath).toMatch(/templates\/logo-reveal\.motion\.json$/);
  });

  test("getTemplatePath throws for nonexistent template", () => {
    expect(() => getTemplatePath("non-existent-template-xyz")).toThrow(
      /Template not found/,
    );
  });

  test("loadTemplate loads and parses title-card template accurately", async () => {
    const doc = await loadTemplate("title-card");
    expect(doc.version).toBe(1);
    expect(doc.name).toBe("Title Card");
    expect(doc.canvas.width).toBe(1920);
    expect(doc.canvas.height).toBe(1080);
    expect(doc.canvas.fps).toBe(30);
    expect(doc.canvas.duration).toBe(4);
    expect(doc.layers.length).toBeGreaterThan(0);
    expect(doc.params).toHaveProperty("headline");
  });

  test("loadTemplate loads all starter templates without schema errors", async () => {
    const templateNames = [
      "title-card",
      "logo-reveal",
      "lower-third",
      "loader",
    ];
    for (const name of templateNames) {
      const doc = await loadTemplate(name);
      expect(doc.version).toBe(1);
      expect(typeof doc.name).toBe("string");
      expect(doc.canvas.width).toBeGreaterThan(0);
      expect(doc.canvas.height).toBeGreaterThan(0);
      expect(doc.canvas.fps).toBeGreaterThan(0);
      expect(doc.canvas.duration).toBeGreaterThan(0);
      expect(Array.isArray(doc.layers)).toBe(true);
    }
  });

  test("parseTemplate rejects invalid inputs", () => {
    expect(() => parseTemplate("invalid json")).toThrow();
    expect(() =>
      parseTemplate({
        version: 2,
        name: "test",
        canvas: { width: 100, height: 100, fps: 30, duration: 1 },
        layers: [],
      }),
    ).toThrow(/Unsupported template version/);
    expect(() =>
      parseTemplate({
        version: 1,
        name: "",
        canvas: { width: 100, height: 100, fps: 30, duration: 1 },
        layers: [],
      }),
    ).toThrow(/missing or invalid 'name'/);
  });
});
