import { AnimatorError } from "@animator/core";
import { MockAudioBuffer } from "./webAudioMock.js";

export interface AssetRegistryOptions {
  /**
   * Maximum allowed memory allocation in bytes for pre-decoded AudioBuffers.
   * Default: 500 MB (524,288,000 bytes)
   */
  maxMemoryLimitBytes?: number;
}

export class AssetRegistry {
  private audioBuffers = new Map<string, AudioBuffer>();
  private maxMemoryLimitBytes: number;

  constructor(options: AssetRegistryOptions = {}) {
    this.maxMemoryLimitBytes = options.maxMemoryLimitBytes ?? 524_288_000; // 500MB
  }

  /**
   * Calculates total memory used by all cached AudioBuffers in bytes.
   */
  getMemoryUsageBytes(): number {
    let bytes = 0;
    for (const buffer of this.audioBuffers.values()) {
      // 4 bytes per sample per channel (Float32Array)
      bytes += buffer.numberOfChannels * buffer.length * 4;
    }
    return bytes;
  }

  /**
   * Registers and decodes an audio track from a video/audio ArrayBuffer into an AudioBuffer.
   */
  async registerAudioAsset(
    assetId: string,
    data: ArrayBuffer | Uint8Array,
    audioCtx?: BaseAudioContext,
  ): Promise<AudioBuffer> {
    if (!assetId) {
      throw new AnimatorError("Asset ID is required", {
        code: "INVALID_ASSET_ID",
        path: "assetRegistry.registerAudioAsset",
      });
    }

    let arrayBuffer: ArrayBuffer;
    if (data instanceof Uint8Array) {
      const buf = new ArrayBuffer(data.byteLength);
      new Uint8Array(buf).set(data);
      arrayBuffer = buf;
    } else {
      arrayBuffer = data;
    }

    let audioBuffer: AudioBuffer;

    if (audioCtx && typeof audioCtx.decodeAudioData === "function") {
      try {
        // Slice buffer as decodeAudioData detaches the buffer in some browser engines
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      } catch (err) {
        throw new AnimatorError(
          `Failed to decode audio track for asset ${assetId}: ${String(err)}`,
          {
            code: "AUDIO_DECODE_FAILED",
            path: `assetRegistry.${assetId}`,
            hint: "Ensure the file contains a valid audio track supported by WebAudio",
          },
        );
      }
    } else {
      // Fallback PCM / Mock AudioBuffer parser (for tests & headless Node environments)
      audioBuffer = this.parseOrMockAudioBuffer(arrayBuffer);
    }

    const newAssetBytes = audioBuffer.numberOfChannels * audioBuffer.length * 4;
    const currentBytes = this.getMemoryUsageBytes();

    if (currentBytes + newAssetBytes > this.maxMemoryLimitBytes) {
      throw new AnimatorError(
        `Pre-decoded AudioBuffer exceeds heap memory limit (${Math.round((currentBytes + newAssetBytes) / (1024 * 1024))}MB > ${Math.round(this.maxMemoryLimitBytes / (1024 * 1024))}MB)`,
        {
          code: "HEAP_LIMIT_EXCEEDED",
          path: `assetRegistry.${assetId}`,
          hint: "Uncompressed audio tracks exceed heap memory limit. Downsample or clear unused assets.",
        },
      );
    }

    this.audioBuffers.set(assetId, audioBuffer);
    return audioBuffer;
  }

  /**
   * Directly sets a pre-decoded AudioBuffer into the registry.
   */
  setAudioBuffer(assetId: string, audioBuffer: AudioBuffer): void {
    const assetBytes = audioBuffer.numberOfChannels * audioBuffer.length * 4;
    if (this.getMemoryUsageBytes() + assetBytes > this.maxMemoryLimitBytes) {
      throw new AnimatorError("AudioBuffer allocation exceeds heap limit", {
        code: "HEAP_LIMIT_EXCEEDED",
        path: `assetRegistry.${assetId}`,
      });
    }
    this.audioBuffers.set(assetId, audioBuffer);
  }

  /**
   * Retrieves a pre-decoded AudioBuffer by asset ID.
   */
  getAudioBuffer(assetId: string): AudioBuffer | undefined {
    return this.audioBuffers.get(assetId);
  }

  /**
   * Removes an asset from the registry to free memory.
   */
  removeAsset(assetId: string): boolean {
    return this.audioBuffers.delete(assetId);
  }

  /**
   * Clears all cached AudioBuffers.
   */
  clear(): void {
    this.audioBuffers.clear();
  }

  private parseOrMockAudioBuffer(arrayBuffer: ArrayBuffer): AudioBuffer {
    const bytes = new Uint8Array(arrayBuffer);
    const sampleRate = 44100;
    const numberOfChannels = 2;

    const samplesCount = Math.max(1, Math.floor(bytes.length / 4));
    const mockBuffer = new MockAudioBuffer({
      numberOfChannels,
      length: samplesCount,
      sampleRate,
    });

    for (let c = 0; c < numberOfChannels; c++) {
      const channelData = mockBuffer.getChannelData(c);
      for (let i = 0; i < samplesCount; i++) {
        const byteIndex = (i * numberOfChannels + c) % bytes.length;
        const val = bytes[byteIndex];
        if (val !== undefined) {
          channelData[i] = (val / 255) * 2 - 1;
        }
      }
    }

    return mockBuffer as unknown as AudioBuffer;
  }
}
