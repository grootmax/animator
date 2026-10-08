import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, test } from "vitest";
import { getCanvasKit, renderFrame } from "../src/index.js";

describe("renderFrame CanvasKit headless renderer", () => {
  test("getCanvasKit initializes once per process and caches the instance", async () => {
    const ck1 = await getCanvasKit();
    const ck2 = await getCanvasKit();
    expect(ck1).toBeDefined();
    expect(ck1).toBe(ck2);
    expect(typeof ck1.MakeManagedAnimation).toBe("function");
  });

  test("renders hello-dot frame 15 to PNG matching pixel values", async () => {
    const fixturePath = resolve(process.cwd(), "fixtures/hello-dot.json");
    const lottie = await readFile(fixturePath, "utf-8");

    const pngBytes = await renderFrame({
      lottie,
      frame: 15,
      width: 100,
      height: 100,
      background: "#0B1020",
    });

    expect(pngBytes).toBeInstanceOf(Uint8Array);
    expect(pngBytes.length).toBeGreaterThan(0);

    // PNG Header / Signature check
    const expectedHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const header = Array.from(pngBytes.subarray(0, 8));
    expect(header).toEqual(expectedHeader);

    // Decode PNG to check pixel values using pngjs
    const png = PNG.sync.read(Buffer.from(pngBytes));
    expect(png.width).toBe(100);
    expect(png.height).toBe(100);

    const getPixel = (x: number, y: number) => {
      const idx = (y * png.width + x) * 4;
      return [
        png.data[idx] ?? 0,
        png.data[idx + 1] ?? 0,
        png.data[idx + 2] ?? 0,
        png.data[idx + 3] ?? 0,
      ];
    };

    // Dot pixel at (50, 50) -> expected [255, 90, 95, 255]
    const dotPixel = getPixel(50, 50);
    expect(dotPixel[0]).toBeGreaterThanOrEqual(253);
    expect(dotPixel[0]).toBeLessThanOrEqual(257);
    expect(dotPixel[1]).toBeGreaterThanOrEqual(88);
    expect(dotPixel[1]).toBeLessThanOrEqual(92);
    expect(dotPixel[2]).toBeGreaterThanOrEqual(93);
    expect(dotPixel[2]).toBeLessThanOrEqual(97);
    expect(dotPixel[3]).toBe(255);

    // Background pixel at (5, 5) -> expected [11, 16, 32, 255]
    const bgPixel = getPixel(5, 5);
    expect(bgPixel[0]).toBeGreaterThanOrEqual(9);
    expect(bgPixel[0]).toBeLessThanOrEqual(13);
    expect(bgPixel[1]).toBeGreaterThanOrEqual(14);
    expect(bgPixel[1]).toBeLessThanOrEqual(18);
    expect(bgPixel[2]).toBeGreaterThanOrEqual(30);
    expect(bgPixel[2]).toBeLessThanOrEqual(34);
    expect(bgPixel[3]).toBe(255);
  });
});
