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
