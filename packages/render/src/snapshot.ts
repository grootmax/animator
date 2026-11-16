import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface SnapshotCompareOptions {
  actualPng: Uint8Array;
  expectedPng: Uint8Array;
  threshold?: number;
  maxDiffPixels?: number;
  diffOutputPath?: string;
}

export interface SnapshotCompareResult {
  isMatch: boolean;
  diffPixelCount: number;
  totalPixels: number;
  diffPng?: Uint8Array;
}

export function comparePngSnapshots(
  options: SnapshotCompareOptions,
): SnapshotCompareResult {
  const actual = PNG.sync.read(Buffer.from(options.actualPng));
  const expected = PNG.sync.read(Buffer.from(options.expectedPng));

  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Image dimensions mismatch: actual (${actual.width}x${actual.height}) vs expected (${expected.width}x${expected.height})`,
    );
  }

  const { width, height } = actual;
  const diffPng = new PNG({ width, height });

  const diffPixelCount = pixelmatch(
    actual.data,
    expected.data,
    diffPng.data,
    width,
    height,
    {
      threshold: options.threshold ?? 0.1,
    },
  );

  const maxDiffPixels = options.maxDiffPixels ?? 0;
  const isMatch = diffPixelCount <= maxDiffPixels;

  const encodedDiff = PNG.sync.write(diffPng);

  if (!isMatch && options.diffOutputPath) {
    fs.mkdirSync(path.dirname(options.diffOutputPath), { recursive: true });
    fs.writeFileSync(options.diffOutputPath, encodedDiff);
  }

  return {
    isMatch,
    diffPixelCount,
    totalPixels: width * height,
    diffPng: new Uint8Array(encodedDiff),
  };
}

export function getPixelColor(
  pngBytes: Uint8Array,
  x: number,
  y: number,
): [number, number, number, number] {
  const png = PNG.sync.read(Buffer.from(pngBytes));
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) {
    throw new Error(
      `Coordinates (${x}, ${y}) out of bounds for image (${png.width}x${png.height})`,
    );
  }
  const idx = (png.width * y + x) << 2;
  return [
    png.data[idx] ?? 0,
    png.data[idx + 1] ?? 0,
    png.data[idx + 2] ?? 0,
    png.data[idx + 3] ?? 0,
  ];
}

export function assertPixelColor(
  pngBytes: Uint8Array,
  x: number,
  y: number,
  expected: [number, number, number, number],
  tolerance = 2,
): void {
  const actual = getPixelColor(pngBytes, x, y);
  for (let c = 0; c < 4; c++) {
    const act = actual[c] ?? 0;
    const exp = expected[c] ?? 0;
    if (Math.abs(act - exp) > tolerance) {
      throw new Error(
        `Pixel at (${x}, ${y}) channel ${c} mismatch: expected ${exp} +/- ${tolerance}, got ${act} (full actual: [${actual.join(", ")}], expected: [${expected.join(", ")}])`,
      );
    }
  }
}
