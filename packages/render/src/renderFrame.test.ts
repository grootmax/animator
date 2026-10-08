import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCanvasKit } from "./canvaskit.js";
import { renderFrame } from "./renderFrame.js";

describe("renderFrame Headless Skottie", () => {
  it("renders a Lottie frame to valid PNG bytes and reuses CanvasKit instance", async () => {
    const ck1 = await getCanvasKit();
    const ck2 = await getCanvasKit();
    expect(ck1).toBe(ck2);

    const fixturePath = path.resolve(process.cwd(), "fixtures/hello-dot.json");
    const lottieJson = fs.readFileSync(fixturePath, "utf-8");

    const pngBytes = await renderFrame({
      lottie: lottieJson,
      frame: 15,
      width: 100,
      height: 100,
      background: "#0B1020",
    });

    expect(pngBytes).toBeInstanceOf(Uint8Array);
    expect(pngBytes.length).toBeGreaterThan(100);

    // PNG signature check: 89 50 4E 47 0D 0A 1A 0A
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50); // 'P'
    expect(pngBytes[2]).toBe(0x4e); // 'N'
    expect(pngBytes[3]).toBe(0x47); // 'G'

    // Verify rendered pixels using CanvasKit
    const img = ck1.MakeImageFromEncoded(pngBytes);
    expect(img).not.toBeNull();
    if (img) {
      // Read pixel at (50, 50) - dot center
      const dotPixels = img.readPixels(50, 50, {
        width: 1,
        height: 1,
        colorType: ck1.ColorType.RGBA_8888,
        alphaType: ck1.AlphaType.Unpremul,
        colorSpace: ck1.ColorSpace.SRGB,
      });
      expect(dotPixels).not.toBeNull();
      if (dotPixels) {
        expect(dotPixels[0]).toBeGreaterThanOrEqual(253); // Red ~ 255
        expect(dotPixels[1]).toBeGreaterThanOrEqual(88); // Green ~ 90
        expect(dotPixels[1]).toBeLessThanOrEqual(92);
        expect(dotPixels[2]).toBeGreaterThanOrEqual(93); // Blue ~ 95
        expect(dotPixels[2]).toBeLessThanOrEqual(97);
        expect(dotPixels[3]).toBe(255); // Alpha = 255
      }

      // Read pixel at (5, 5) - background #0B1020 (R:11, G:16, B:32)
      const bgPixels = img.readPixels(5, 5, {
        width: 1,
        height: 1,
        colorType: ck1.ColorType.RGBA_8888,
        alphaType: ck1.AlphaType.Unpremul,
        colorSpace: ck1.ColorSpace.SRGB,
      });
      expect(bgPixels).not.toBeNull();
      if (bgPixels) {
        expect(bgPixels[0]).toBe(11);
        expect(bgPixels[1]).toBe(16);
        expect(bgPixels[2]).toBe(32);
        expect(bgPixels[3]).toBe(255);
      }

      img.delete();
    }
  });
});
