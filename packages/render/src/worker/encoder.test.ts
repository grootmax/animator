import { describe, expect, it, vi } from "vitest";
import { WebCodecsEncoder } from "./encoder.js";

function createMockCanvas(width = 100, height = 100) {
  const ctx = {
    getImageData: () => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  };
  return {
    width,
    height,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

describe("WebCodecsEncoder", () => {
  it("detects WebCodecs support status", () => {
    // In Node vitest without WebCodecs global, isSupported should return false
    expect(typeof WebCodecsEncoder.isSupported()).toBe("boolean");
  });

  it("encodes frames and invokes onChunk callback", async () => {
    const chunks: ArrayBuffer[] = [];
    const timestamps: number[] = [];
    const keyFrames: boolean[] = [];

    const encoder = new WebCodecsEncoder({
      width: 64,
      height: 64,
      fps: 30,
      onChunk: (chunk, timestamp, isKeyFrame) => {
        chunks.push(chunk);
        timestamps.push(timestamp);
        keyFrames.push(isKeyFrame);
      },
    });

    await encoder.init();

    const canvas = createMockCanvas(64, 64);
    await encoder.encodeFrame(canvas, 0, true);
    await encoder.encodeFrame(canvas, 1, false);

    expect(encoder.getFrameCount()).toBe(2);
    expect(chunks.length).toBe(2);
    expect(keyFrames[0]).toBe(true);
    expect(keyFrames[1]).toBe(false);
    expect(timestamps[0]).toBe(0); // 0 microseconds
    expect(timestamps[1]).toBe(33333); // 1/30s in microseconds (~33333us)

    await encoder.flush();
    await encoder.close();
  });
});
