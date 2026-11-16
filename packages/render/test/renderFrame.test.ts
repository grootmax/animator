import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, test } from "vitest";
import {
  assertPixelColor,
  comparePngSnapshots,
  getCanvasKit,
  getPixelColor,
  renderFrame,
} from "../src/index.js";

const FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  "../../../fixtures/hello-dot.json",
);

describe("packages/render", () => {
  test("getCanvasKit caches and reuses the process-wide instance", async () => {
    const ck1 = await getCanvasKit();
    const ck2 = await getCanvasKit();
    expect(ck1).toBeDefined();
    expect(ck1).toBe(ck2);
  });

  test("renderFrame renders hello-dot frame 15 to PNG with correct pixels", async () => {
    const lottieStr = fs.readFileSync(FIXTURE_PATH, "utf8");
    const pngBytes = await renderFrame({
      lottie: lottieStr,
      frame: 15,
      width: 100,
      height: 100,
      background: "#0B1020",
    });

    // Verify PNG signature bytes (\x89PNG\r\n\x1a\n)
    expect(pngBytes).toBeInstanceOf(Uint8Array);
    expect(pngBytes.length).toBeGreaterThan(0);
    const signature = Array.from(pngBytes.slice(0, 8));
    expect(signature).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Parse PNG and inspect pixel RGBA values directly
    const png = PNG.sync.read(Buffer.from(pngBytes));
    expect(png.width).toBe(100);
    expect(png.height).toBe(100);

    // Dot center at (50, 50) expected [255, 90, 95, 255] +/- 2
    const dotPixel = getPixelColor(pngBytes, 50, 50);
    expect(dotPixel[0]).toBeGreaterThanOrEqual(253);
    expect(dotPixel[0]).toBeLessThanOrEqual(257);
    expect(dotPixel[1]).toBeGreaterThanOrEqual(88);
    expect(dotPixel[1]).toBeLessThanOrEqual(92);
    expect(dotPixel[2]).toBeGreaterThanOrEqual(93);
    expect(dotPixel[2]).toBeLessThanOrEqual(97);
    expect(dotPixel[3]).toBe(255);

    // Background at (5, 5) expected [11, 16, 32, 255] +/- 2 (#0B1020)
    const bgPixel = getPixelColor(pngBytes, 5, 5);
    expect(bgPixel[0]).toBeGreaterThanOrEqual(9);
    expect(bgPixel[0]).toBeLessThanOrEqual(13);
    expect(bgPixel[1]).toBeGreaterThanOrEqual(14);
    expect(bgPixel[1]).toBeLessThanOrEqual(18);
    expect(bgPixel[2]).toBeGreaterThanOrEqual(30);
    expect(bgPixel[2]).toBeLessThanOrEqual(34);
    expect(bgPixel[3]).toBe(255);

    // Also assert with helper
    assertPixelColor(pngBytes, 50, 50, [255, 90, 95, 255], 2);
    assertPixelColor(pngBytes, 5, 5, [11, 16, 32, 255], 2);
  });

  test("comparePngSnapshots verifies identical frame snapshots match", async () => {
    const lottieStr = fs.readFileSync(FIXTURE_PATH, "utf8");
    const frame1 = await renderFrame({
      lottie: lottieStr,
      frame: 15,
      width: 100,
      height: 100,
    });
    const frame2 = await renderFrame({
      lottie: lottieStr,
      frame: 15,
      width: 100,
      height: 100,
    });

    const result = comparePngSnapshots({
      actualPng: frame1,
      expectedPng: frame2,
    });

    expect(result.isMatch).toBe(true);
    expect(result.diffPixelCount).toBe(0);
  });

  test("renderFrame handles repeated renderings without memory leak failures", async () => {
    const lottieStr = fs.readFileSync(FIXTURE_PATH, "utf8");
    for (let f = 0; f < 20; f++) {
      const pngBytes = await renderFrame({
        lottie: lottieStr,
        frame: f % 30,
        width: 100,
        height: 100,
      });
      expect(pngBytes.length).toBeGreaterThan(0);
    }
  });
});
