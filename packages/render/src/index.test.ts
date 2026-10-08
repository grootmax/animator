import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, test } from "vitest";
import {
  RENDER_VERSION,
  comparePngSnapshots,
  getCanvasKit,
  renderContactSheet,
  renderFrame,
} from "./index.js";

const GOLDEN_FIXTURES = [
  "hello-dot",
  "shape-rect",
  "shape-ellipse",
  "path-animation",
  "transform-rotation",
  "opacity-fade",
  "scale-bounce",
  "color-fill",
  "group-precomp",
  "multi-layer",
];

describe("Render Package Tests", () => {
  test("render version is defined", () => {
    expect(RENDER_VERSION).toBe("0.0.0");
  });

  test("getCanvasKit initializes once and reuses single instance", async () => {
    const ck1 = await getCanvasKit();
    const ck2 = await getCanvasKit();
    expect(ck1).toBe(ck2);
    expect(typeof ck1.MakeManagedAnimation).toBe("function");
  });

  test("renderFrame renders hello-dot at frame 15 with expected pixel values", async () => {
    const jsonPath = path.resolve(process.cwd(), "fixtures/hello-dot.json");
    const lottieStr = fs.readFileSync(jsonPath, "utf8");

    const pngBytes = await renderFrame({
      lottie: lottieStr,
      frame: 15,
      width: 100,
      height: 100,
      background: "#0B1020",
    });

    expect(pngBytes).toBeInstanceOf(Uint8Array);
    expect(pngBytes.length).toBeGreaterThan(0);

    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);

    const png = PNG.sync.read(Buffer.from(pngBytes));
    expect(png.width).toBe(100);
    expect(png.height).toBe(100);

    const dotIdx = (100 * 50 + 50) * 4;
    expect(Math.abs((png.data[dotIdx] ?? 0) - 255)).toBeLessThanOrEqual(2);
    expect(Math.abs((png.data[dotIdx + 1] ?? 0) - 90)).toBeLessThanOrEqual(2);
    expect(Math.abs((png.data[dotIdx + 2] ?? 0) - 95)).toBeLessThanOrEqual(2);
    expect(png.data[dotIdx + 3]).toBe(255);

    const bgIdx = (100 * 5 + 5) * 4;
    expect(Math.abs((png.data[bgIdx] ?? 0) - 11)).toBeLessThanOrEqual(2);
    expect(Math.abs((png.data[bgIdx + 1] ?? 0) - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs((png.data[bgIdx + 2] ?? 0) - 32)).toBeLessThanOrEqual(2);
    expect(png.data[bgIdx + 3]).toBe(255);
  });

  test("renderFrame supports time-based frame seeking", async () => {
    const jsonPath = path.resolve(process.cwd(), "fixtures/hello-dot.json");
    const lottieStr = fs.readFileSync(jsonPath, "utf8");

    const framePng = await renderFrame({
      lottie: lottieStr,
      frame: 15,
      background: "#0B1020",
    });
    const timePng = await renderFrame({
      lottie: lottieStr,
      time: 0.5,
      background: "#0B1020",
    });

    const result = comparePngSnapshots({
      actualPng: framePng,
      expectedPng: timePng,
      threshold: 0.1,
    });
    expect(result.isMatch).toBe(true);
    expect(result.diffPixelCount).toBe(0);
  });

  test("renderContactSheet generates multi-frame grid image", async () => {
    const jsonPath = path.resolve(process.cwd(), "fixtures/multi-layer.json");
    const lottieStr = fs.readFileSync(jsonPath, "utf8");

    const sheetPng = await renderContactSheet({
      lottie: lottieStr,
      cols: 4,
      rows: 4,
      frameCount: 16,
      tileWidth: 100,
      tileHeight: 100,
      background: "#0B1020",
    });

    const png = PNG.sync.read(Buffer.from(sheetPng));
    expect(png.width).toBe(400);
    expect(png.height).toBe(400);
  });

  test("snapshot comparison tests run across all 10 golden fixtures", async () => {
    for (const name of GOLDEN_FIXTURES) {
      const jsonPath = path.resolve(process.cwd(), `fixtures/${name}.json`);
      const baselinePath = path.resolve(
        process.cwd(),
        `fixtures/baselines/${name}-15.png`,
      );

      expect(fs.existsSync(jsonPath)).toBe(true);
      expect(fs.existsSync(baselinePath)).toBe(true);

      const lottieStr = fs.readFileSync(jsonPath, "utf8");
      const baselinePng = fs.readFileSync(baselinePath);

      const actualPng = await renderFrame({
        lottie: lottieStr,
        frame: 15,
        width: 100,
        height: 100,
        background: "#0B1020",
      });

      const result = comparePngSnapshots({
        actualPng,
        expectedPng: baselinePng,
        threshold: 0.1,
      });

      expect(
        result.isMatch,
        `Fixture ${name} snapshot comparison should match baseline`,
      ).toBe(true);
      expect(result.diffPixelCount).toBe(0);
    }
  });

  test("comparePngSnapshots creates visual diff overlay image on mismatch", () => {
    const img1 = new PNG({ width: 10, height: 10 });
    const img2 = new PNG({ width: 10, height: 10 });

    for (let i = 0; i < 100 * 4; i += 4) {
      img1.data[i] = 10;
      img1.data[i + 1] = 10;
      img1.data[i + 2] = 10;
      img1.data[i + 3] = 255;

      img2.data[i] = 10;
      img2.data[i + 1] = 10;
      img2.data[i + 2] = 10;
      img2.data[i + 3] = 255;
    }

    img2.data[0] = 255;

    const diffPath = path.resolve(
      process.cwd(),
      "renders/test-diff-overlay.png",
    );
    if (fs.existsSync(diffPath)) {
      fs.unlinkSync(diffPath);
    }

    const result = comparePngSnapshots({
      actualPng: PNG.sync.write(img2),
      expectedPng: PNG.sync.write(img1),
      threshold: 0.1,
      diffOutputPath: diffPath,
    });

    expect(result.isMatch).toBe(false);
    expect(result.diffPixelCount).toBeGreaterThan(0);
    expect(fs.existsSync(diffPath)).toBe(true);

    const diffImage = PNG.sync.read(fs.readFileSync(diffPath));
    expect(diffImage.width).toBe(10);
    expect(diffImage.height).toBe(10);
  });
});
