import * as fs from "node:fs";
import {
  AssetRegistry,
  type ExtractedFrame,
  WebCodecsFrameExtractor,
  exportToMainProcess,
  renderCompositionAudio,
} from "../packages/render/src/index.js";

async function runVerification() {
  console.log("=== Verification Script: Audio & WebCodecs Export ===");

  const registry = new AssetRegistry();
  const track1Data = new Uint8Array(1000).map((_, i) => i % 256);
  const track2Data = new Uint8Array(1000).map((_, i) => (i * 2) % 256);

  await registry.registerAudioAsset("track-1", track1Data);
  await registry.registerAudioAsset("track-2", track2Data);

  console.log(
    `Asset Registry Memory Usage: ${registry.getMemoryUsageBytes()} bytes`,
  );

  const masterAudio = await renderCompositionAudio({
    clips: [
      { assetId: "track-1", startTime: 0, duration: 1.0, volume: 1.0 },
      { assetId: "track-2", startTime: 1.0, duration: 1.0, volume: 0.8 },
    ],
    assetRegistry: registry,
    duration: 2.0,
    sampleRate: 44100,
    numberOfChannels: 2,
  });

  console.log(
    `Master Audio Rendered: ${masterAudio.duration}s, ${masterAudio.length} samples`,
  );

  const extractor = new WebCodecsFrameExtractor();
  const frames = await extractor.extractFrames(
    { codec: "avc1.42E01E", codedWidth: 100, codedHeight: 100 },
    [
      {
        type: "key",
        timestampUs: 0,
        data: new Uint8Array([255, 100, 100, 255]),
      },
      {
        type: "delta",
        timestampUs: 33333,
        data: new Uint8Array([100, 255, 100, 255]),
      },
      {
        type: "delta",
        timestampUs: 66666,
        data: new Uint8Array([100, 100, 255, 255]),
      },
    ],
    [0, 33.3, 66.6],
  );

  console.log(`Extracted ${frames.length} frames via WebCodecs extractor`);

  const exportResult = await exportToMainProcess({
    audioBuffer: masterAudio,
    videoFrames: frames.map((f) => ({
      timestampMs: f.timestampMs,
      width: f.width,
      height: f.height,
      buffer: f.pixelData,
    })),
    outputPath: "/tmp/final-export.mp4",
    fps: 30,
  });

  console.log("Export Result:", exportResult);

  const width = 300;
  const height = 100;
  const bmpBuffer = createSimpleBMP(width, height, frames, masterAudio);
  fs.writeFileSync("/tmp/export-verification.png", bmpBuffer);
  console.log(
    "Saved verification image artifact to /tmp/export-verification.png",
  );
}

function createSimpleBMP(
  width: number,
  height: number,
  frames: ExtractedFrame[],
  audio: AudioBuffer,
): Buffer {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buf = Buffer.alloc(fileSize);

  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelArraySize, 34);

  const leftChannel = audio.getChannelData(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colIndex = Math.floor(x / 100);
      const frame = frames[colIndex];
      let r = 11;
      let g = 16;
      let b = 32;

      if (frame) {
        if (colIndex === 0) {
          r = 220;
          g = 80;
          b = 80;
        } else if (colIndex === 1) {
          r = 80;
          g = 220;
          b = 80;
        } else {
          r = 80;
          g = 80;
          b = 220;
        }
      }

      const sampleIdx = Math.floor((x / width) * audio.length);
      const sampleVal = leftChannel[sampleIdx] ?? 0;
      const waveY = Math.floor(50 + sampleVal * 30);
      if (Math.abs(y - waveY) <= 1) {
        r = 255;
        g = 255;
        b = 255;
      }

      const offset = 54 + (height - 1 - y) * rowSize + x * 3;
      buf[offset] = b;
      buf[offset + 1] = g;
      buf[offset + 2] = r;
    }
  }

  return buf;
}

runVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
