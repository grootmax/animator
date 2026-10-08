import { describe, expect, it } from "vitest";
import { GLYPH_PATHS, convertTextToPath } from "./textToPath.js";

describe("Text to Vector Path Engine", () => {
  it("converts text strings to deterministic vector path data without canvas or font dependencies", () => {
    const pathData = convertTextToPath("ABC 123", 20, 10, 40);
    expect(typeof pathData).toBe("string");
    expect(pathData.length).toBeGreaterThan(0);
    expect(pathData).toContain("M");
  });

  it("handles empty strings", () => {
    expect(convertTextToPath("")).toBe("");
  });

  it("handles newlines correctly", () => {
    const pathSingleLine = convertTextToPath("A", 100, 0, 0);
    const pathMultiLine = convertTextToPath("A\nA", 100, 0, 0);

    expect(pathMultiLine).not.toBe(pathSingleLine);
    expect(pathMultiLine).toContain("M");
  });

  it("uses fallback glyph for unknown characters", () => {
    const pathWithFallback = convertTextToPath("🚀", 16, 0, 0);
    expect(pathWithFallback).toBeDefined();
    expect(pathWithFallback.length).toBeGreaterThan(0);
    expect(pathWithFallback).toContain("M");
  });

  it("scales and offsets vector paths accurately based on font size and start position", () => {
    const defaultPath = convertTextToPath("A", 100, 0, 0);
    const offsetPath = convertTextToPath("A", 100, 50, 100);

    expect(defaultPath).not.toBe(offsetPath);
    expect(offsetPath).toContain("60.00");
    expect(offsetPath).toContain("100.00");
  });

  it("exports glyph path definitions with advance widths", () => {
    expect(GLYPH_PATHS.A).toBeDefined();
    expect(GLYPH_PATHS.A?.advance).toBe(0.65);
    expect(GLYPH_PATHS.fallback).toBeDefined();
  });
});
