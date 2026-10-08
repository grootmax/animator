import { describe, expect, test, vi } from "vitest";
import {
  AssetRegistry,
  ElectronMuxerBridge,
  MockAudioBuffer,
  OfflineAudioMixer,
  RENDER_VERSION,
  VideoFrameExtractor,
} from "./index.js";

describe("@animator/render", () => {
  test("render version is defined", () => {
    expect(RENDER_VERSION).toBe("0.0.0");
  });

  describe("AssetRegistry (Audio Pre-decoding)", () => {
    test("pre-decodes audio track from imported video into AudioBuffer instance", async () => {
      const registry = new AssetRegistry();
      const mockVideoData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer;

      const imported = await registry.decodeAndRegisterAudioTrack(
        "video-asset-1",
        mockVideoData,
        {
          sampleRate: 48000,
          numberOfChannels: 2,
          durationSec: 3.0,
        },
      );

      expect(imported.assetId).toBe("video-asset-1");
      expect(imported.sampleRate).toBe(48000);
      expect(imported.channels).toBe(2);
      expect(imported.durationSec).toBe(3.0);

      const retrieved = registry.getAudioBuffer("video-asset-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.numberOfChannels).toBe(2);
      expect(retrieved?.sampleRate).toBe(48000);
      expect(retrieved?.duration).toBe(3.0);
      expect(registry.hasAudioBuffer("video-asset-1")).toBe(true);
    });

    test("MockAudioBuffer supports channel copy and access", () => {
      const buffer = new MockAudioBuffer({
        numberOfChannels: 2,
        length: 100,
        sampleRate: 44100,
      });

      expect(buffer.duration).toBeCloseTo(100 / 44100);
      const left = buffer.getChannelData(0);
      left[0] = 0.75;
      expect(buffer.getChannelData(0)[0]).toBe(0.75);

      const dest = new Float32Array(1);
      buffer.copyFromChannel(dest, 0, 0);
      expect(dest[0]).toBe(0.75);
    });
  });

  describe("OfflineAudioMixer (Timeline Mixing)", () => {
    test("renders full composition audio track placing buffers at startTime and mediaOffset", async () => {
      const registry = new AssetRegistry();

      // Create pre-decoded source buffer with distinct 440Hz test audio
      const sourceAudio = new MockAudioBuffer({
        numberOfChannels: 2,
        length: 88200, // 2 seconds at 44.1kHz
        sampleRate: 44100,
      });
      const leftCh = sourceAudio.getChannelData(0);
      for (let i = 0; i < leftCh.length; i++) {
        leftCh[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
      }
      registry.registerAudioBuffer("asset-bgm", sourceAudio);

      const mixer = new OfflineAudioMixer({
        sampleRate: 44100,
        numberOfChannels: 2,
      });
      const masterAudio = await mixer.renderCompositionAudio(
        [
          {
            assetId: "asset-bgm",
            startTime: 1.0, // starts 1 second into timeline
            mediaOffset: 0.5, // 0.5 sec offset into source asset
            duration: 1.5, // plays for 1.5 seconds
            volume: 0.8,
          },
        ],
        registry,
        4.0, // 4 seconds composition
      );

      expect(masterAudio).toBeDefined();
      expect(masterAudio.sampleRate).toBe(44100);
      expect(masterAudio.duration).toBe(4.0);

      const masterChannels = OfflineAudioMixer.extractPCMChannels(masterAudio);
      expect(masterChannels.length).toBe(2);

      // Before startTime (0..1.0s), signal should be silent (0.0)
      const silenceSampleIdx = Math.round(0.5 * 44100);
      expect(masterChannels[0]?.[silenceSampleIdx]).toBe(0);

      // During active placement (1.0..2.5s), signal should be synthesized
      const activeSampleIdx = Math.round(1.5 * 44100);
      expect(masterChannels[0]?.[activeSampleIdx]).not.toBe(0);

      // Encode WAV test
      const wavBytes = OfflineAudioMixer.encodeWAV(masterAudio);
      expect(wavBytes.byteLength).toBeGreaterThan(44);
    });
  });

  describe("VideoFrameExtractor (WebCodecs & Canvas Frame Extraction)", () => {
    test("extracts video frame bitmaps deterministically for offline composition", async () => {
      const extractor = new VideoFrameExtractor({
        codec: "avc1.42E01E",
        codedWidth: 640,
        codedHeight: 360,
      });

      const initResult = await extractor.initDecoder();
      expect(initResult.initialized).toBe(true);

      const frameAt1s = await extractor.extractFrameAt(1.0, 30);
      expect(frameAt1s.timestampSec).toBe(1.0);
      expect(frameAt1s.frameIndex).toBe(30);
      expect(frameAt1s.width).toBe(640);
      expect(frameAt1s.height).toBe(360);
      expect(frameAt1s.buffer.byteLength).toBe(640 * 360 * 4);

      const sequence = await extractor.extractFrameSequence(30, 0.5); // 15 frames
      expect(sequence.length).toBe(15);
      expect(sequence[0]?.frameIndex).toBe(0);
      expect(sequence[14]?.frameIndex).toBe(14);
    });
  });

  describe("ElectronMuxerBridge (Main Process IPC Muxing)", () => {
    test("packages PCM audio buffers and video frame buffers for Electron FFmpeg multiplexing", async () => {
      const audioBuffer = new MockAudioBuffer({
        numberOfChannels: 2,
        length: 44100, // 1 sec
        sampleRate: 44100,
      });

      const extractor = new VideoFrameExtractor({
        codec: "avc1.42E01E",
        codedWidth: 320,
        codedHeight: 240,
      });
      const frames = await extractor.extractFrameSequence(10, 0.2); // 2 frames

      const payload = ElectronMuxerBridge.prepareMuxPayload(
        audioBuffer,
        frames,
        {
          format: "mp4",
          outputPath: "/tmp/output.mp4",
          fps: 30,
        },
      );

      expect(payload.audio.sampleRate).toBe(44100);
      expect(payload.audio.numberOfChannels).toBe(2);
      expect(payload.audio.pcmChannels.length).toBe(2);
      expect(payload.frames.length).toBe(2);
      expect(payload.frames[0]?.width).toBe(320);
      expect(payload.frames[0]?.height).toBe(240);
      expect(payload.outputOptions?.outputPath).toBe("/tmp/output.mp4");

      // Test IPC bridge invocation
      const mockIPC = {
        invoke: vi
          .fn()
          .mockResolvedValue({ success: true, outputPath: "/tmp/output.mp4" }),
      };

      const result = await ElectronMuxerBridge.passToElectronMuxer(
        mockIPC,
        audioBuffer,
        frames,
        { format: "mp4", outputPath: "/tmp/output.mp4" },
      );

      expect(mockIPC.invoke).toHaveBeenCalledWith(
        "mux-video-audio",
        expect.anything(),
      );
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe("/tmp/output.mp4");
    });
  });
});
