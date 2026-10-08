import { AnimatorError } from "@animator/core";
import { describe, expect, it, vi } from "vitest";
import {
  AssetRegistry,
  MockAudioBuffer,
  MockOfflineAudioContext,
  WebCodecsFrameExtractor,
  exportToMainProcess,
  extractPCMData,
  renderCompositionAudio,
} from "./index.js";

describe("Pre-decoded AudioBuffer Synthesis & WebCodecs Export", () => {
  describe("Requirement 1: AssetRegistry Pre-decoding & Heap Safeguard", () => {
    it("pre-decodes imported asset binary into an AudioBuffer and tracks memory usage", async () => {
      const registry = new AssetRegistry();
      const mockBinaryData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

      const buffer = await registry.registerAudioAsset(
        "video-1-audio",
        mockBinaryData,
      );

      expect(buffer).toBeDefined();
      expect(buffer.numberOfChannels).toBe(2);
      expect(buffer.sampleRate).toBe(44100);

      const retrieved = registry.getAudioBuffer("video-1-audio");
      expect(retrieved).toBe(buffer);

      const memoryBytes = registry.getMemoryUsageBytes();
      expect(memoryBytes).toBeGreaterThan(0);
      expect(memoryBytes).toBe(buffer.numberOfChannels * buffer.length * 4);
    });

    it("enforces memory limits and throws AnimatorError when exceeding heap limit", async () => {
      // 1 KB limit
      const registry = new AssetRegistry({ maxMemoryLimitBytes: 1024 });

      const mockAudioCtx = {
        decodeAudioData: async () => {
          return new MockAudioBuffer({
            numberOfChannels: 2,
            length: 1000, // 1000 * 2 * 4 = 8000 bytes > 1024
            sampleRate: 44100,
          }) as unknown as AudioBuffer;
        },
      } as unknown as BaseAudioContext;

      await expect(
        registry.registerAudioAsset(
          "large-video",
          new ArrayBuffer(100),
          mockAudioCtx,
        ),
      ).rejects.toThrow(AnimatorError);

      try {
        await registry.registerAudioAsset(
          "large-video",
          new ArrayBuffer(100),
          mockAudioCtx,
        );
      } catch (err) {
        expect(err).toBeInstanceOf(AnimatorError);
        const animErr = err as AnimatorError;
        expect(animErr.code).toBe("HEAP_LIMIT_EXCEEDED");
      }
    });

    it("handles removing assets and clearing registry", async () => {
      const registry = new AssetRegistry();
      const mockBinary = new Uint8Array([1, 2, 3, 4]);

      await registry.registerAudioAsset("track-a", mockBinary);
      expect(registry.getAudioBuffer("track-a")).toBeDefined();

      const removed = registry.removeAsset("track-a");
      expect(removed).toBe(true);
      expect(registry.getAudioBuffer("track-a")).toBeUndefined();
      expect(registry.getMemoryUsageBytes()).toBe(0);
    });
  });

  describe("Requirement 2: OfflineAudioContext Timeline Mixer", () => {
    it("renders full composition audio with startTime, mediaOffset and volume", async () => {
      const registry = new AssetRegistry();

      // Create a 1-second audio buffer with distinct amplitude pattern (0.5)
      const srcBuf1 = new MockAudioBuffer({
        numberOfChannels: 2,
        length: 44100,
        sampleRate: 44100,
      });
      srcBuf1.getChannelData(0).fill(0.5);
      srcBuf1.getChannelData(1).fill(0.5);
      registry.setAudioBuffer("clip-1", srcBuf1 as unknown as AudioBuffer);

      // Create a 1-second audio buffer with distinct amplitude pattern (0.8)
      const srcBuf2 = new MockAudioBuffer({
        numberOfChannels: 2,
        length: 44100,
        sampleRate: 44100,
      });
      srcBuf2.getChannelData(0).fill(0.8);
      srcBuf2.getChannelData(1).fill(0.8);
      registry.setAudioBuffer("clip-2", srcBuf2 as unknown as AudioBuffer);

      const masterBuffer = await renderCompositionAudio({
        clips: [
          {
            assetId: "clip-1",
            startTime: 0.0,
            mediaOffset: 0.0,
            duration: 1.0,
            volume: 1.0,
          },
          {
            assetId: "clip-2",
            startTime: 1.0,
            mediaOffset: 0.0,
            duration: 1.0,
            volume: 0.5, // Gain 0.5 -> 0.8 * 0.5 = 0.4 amplitude
          },
        ],
        assetRegistry: registry,
        duration: 2.0, // 2 seconds total timeline
        sampleRate: 44100,
        numberOfChannels: 2,
        offlineAudioContextClass:
          MockOfflineAudioContext as unknown as typeof OfflineAudioContext,
      });

      expect(masterBuffer.duration).toBe(2.0);
      expect(masterBuffer.length).toBe(88200);

      // Verify clip 1 audio at t = 0.5s (sample 22050)
      const leftCh = masterBuffer.getChannelData(0);
      expect(leftCh[22050]).toBeCloseTo(0.5, 2);

      // Verify clip 2 audio at t = 1.5s (sample 66150)
      expect(leftCh[66150]).toBeCloseTo(0.4, 2);
    });

    it("throws AnimatorError if clip asset is missing from registry", async () => {
      const registry = new AssetRegistry();

      await expect(
        renderCompositionAudio({
          clips: [{ assetId: "non-existent-asset", startTime: 0 }],
          assetRegistry: registry,
          duration: 3.0,
        }),
      ).rejects.toThrow(AnimatorError);

      try {
        await renderCompositionAudio({
          clips: [{ assetId: "non-existent-asset", startTime: 0 }],
          assetRegistry: registry,
          duration: 3.0,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AnimatorError);
        expect((err as AnimatorError).code).toBe("ASSET_NOT_FOUND");
      }
    });
  });

  describe("Requirement 3: WebCodecs VideoDecoder & Frame Extraction", () => {
    it("extracts frame image bitmaps at specified timestamps for scene graph rendering", async () => {
      const extractor = new WebCodecsFrameExtractor();

      const config = {
        codec: "avc1.42E01E",
        codedWidth: 100,
        codedHeight: 100,
      };

      const chunks = [
        {
          type: "key" as const,
          timestampUs: 0, // 0 ms
          data: new Uint8Array([255, 0, 0, 255]),
        },
        {
          type: "delta" as const,
          timestampUs: 33333, // ~33.3 ms (frame 1 at 30fps)
          data: new Uint8Array([0, 255, 0, 255]),
        },
        {
          type: "delta" as const,
          timestampUs: 66666, // ~66.6 ms (frame 2 at 30fps)
          data: new Uint8Array([0, 0, 255, 255]),
        },
      ];

      const frames = await extractor.extractFrames(
        config,
        chunks,
        [0, 33.3, 66.6],
      );

      expect(frames.length).toBe(3);

      const frame0 = frames[0];
      expect(frame0).toBeDefined();
      expect(frame0?.timestampMs).toBe(0);
      expect(frame0?.width).toBe(100);
      expect(frame0?.height).toBe(100);
      expect(frame0?.pixelData.length).toBe(100 * 100 * 4);

      // Test searching closest frame
      const closest = extractor.getFrameAtTimestamp(35.0);
      expect(closest?.timestampMs).toBe(33.333);

      extractor.close();
      expect(extractor.getFrameAtTimestamp(0)).toBeUndefined();
    });

    it("throws AnimatorError on invalid dimensions", () => {
      const extractor = new WebCodecsFrameExtractor();
      expect(() => {
        extractor.configure({
          codec: "avc1.42E01E",
          codedWidth: 0,
          codedHeight: 100,
        });
      }).toThrow(AnimatorError);
    });
  });

  describe("Requirement 4: Electron Main Process IPC Muxing Bridge", () => {
    it("formats PCM audio and video frames and passes them to Electron IPC", async () => {
      const mockAudio = new MockAudioBuffer({
        numberOfChannels: 2,
        length: 44100,
        sampleRate: 44100,
      });
      mockAudio.getChannelData(0).fill(0.25);
      mockAudio.getChannelData(1).fill(0.75);

      const videoFrames = [
        {
          timestampMs: 0,
          width: 100,
          height: 100,
          buffer: new Uint8Array(100 * 100 * 4),
        },
        {
          timestampMs: 33.3,
          width: 100,
          height: 100,
          buffer: new Uint8Array(100 * 100 * 4),
        },
      ];

      const mockIpc = vi.fn().mockResolvedValue({
        success: true,
        outputPath: "/exports/final.mp4",
        bytesWritten: 123456,
        frameCount: 2,
        audioSamplesCount: 44100,
      });

      const pcmData = extractPCMData(mockAudio as unknown as AudioBuffer);
      expect(pcmData.numberOfChannels).toBe(2);
      expect(pcmData.channels.length).toBe(2);
      expect(pcmData.channels[0]?.[0]).toBe(0.25);
      expect(pcmData.channels[1]?.[0]).toBe(0.75);

      const result = await exportToMainProcess({
        audioBuffer: mockAudio as unknown as AudioBuffer,
        videoFrames,
        outputPath: "/exports/final.mp4",
        fps: 30,
        ipcHandler: mockIpc,
      });

      expect(mockIpc).toHaveBeenCalledTimes(1);
      expect(mockIpc).toHaveBeenCalledWith(
        "mux-media",
        expect.objectContaining({
          outputPath: "/exports/final.mp4",
          fps: 30,
          audio: expect.objectContaining({
            numberOfChannels: 2,
            sampleRate: 44100,
            length: 44100,
          }),
          videoFrames,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.frameCount).toBe(2);
      expect(result.outputPath).toBe("/exports/final.mp4");
    });
  });
});
