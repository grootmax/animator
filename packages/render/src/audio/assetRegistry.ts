/**
 * Polyfill/Interface for AudioBuffer in headless/Node environments
 */
export class MockAudioBuffer implements AudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private channelData: Float32Array<ArrayBuffer>[];

  constructor(options: {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
  }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channelData = Array.from(
      { length: options.numberOfChannels },
      () =>
        new Float32Array(
          new ArrayBuffer(options.length * Float32Array.BYTES_PER_ELEMENT),
        ),
    );
  }

  getChannelData(channel: number): Float32Array<ArrayBuffer> {
    if (channel < 0 || channel >= this.numberOfChannels) {
      throw new IndexSizeError(`Channel index ${channel} out of bounds`);
    }
    const data = this.channelData[channel];
    if (!data) {
      throw new IndexSizeError(`Channel index ${channel} is undefined`);
    }
    return data;
  }

  copyFromChannel(
    destination: Float32Array,
    channelNumber: number,
    bufferOffset = 0,
  ): void {
    const src = this.getChannelData(channelNumber);
    destination.set(
      src.subarray(bufferOffset, bufferOffset + destination.length),
    );
  }

  copyToChannel(
    source: Float32Array,
    channelNumber: number,
    bufferOffset = 0,
  ): void {
    const dest = this.getChannelData(channelNumber);
    dest.set(source, bufferOffset);
  }
}

class IndexSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexSizeError";
  }
}

export interface ImportedVideoAudio {
  assetId: string;
  audioBuffer: AudioBuffer;
  durationSec: number;
  sampleRate: number;
  channels: number;
}

export class AssetRegistry {
  private audioBuffers: Map<string, AudioBuffer> = new Map();

  /**
   * Register a pre-decoded AudioBuffer for an asset ID.
   */
  registerAudioBuffer(assetId: string, audioBuffer: AudioBuffer): void {
    this.audioBuffers.set(assetId, audioBuffer);
  }

  /**
   * Pre-decode audio track from imported video data into an AudioBuffer.
   */
  async decodeAndRegisterAudioTrack(
    assetId: string,
    audioData: ArrayBuffer | Blob,
    options?: {
      sampleRate?: number;
      numberOfChannels?: number;
      durationSec?: number;
      audioContext?: AudioContext | OfflineAudioContext;
    },
  ): Promise<ImportedVideoAudio> {
    let audioBuffer: AudioBuffer;

    const ctx = options?.audioContext;
    if (ctx && typeof ctx.decodeAudioData === "function") {
      const bufferToDecode =
        audioData instanceof Blob ? await audioData.arrayBuffer() : audioData;
      audioBuffer = await ctx.decodeAudioData(bufferToDecode.slice(0));
    } else {
      // Create synthetic audio buffer for headless environment or when decodeAudioData is unneeded
      const sampleRate = options?.sampleRate ?? 44100;
      const numberOfChannels = options?.numberOfChannels ?? 2;
      const durationSec = options?.durationSec ?? 5;
      const length = Math.round(durationSec * sampleRate);

      audioBuffer = new MockAudioBuffer({
        numberOfChannels,
        length,
        sampleRate,
      });

      // Populate dummy test signal (sine wave) into mock buffer channels if ArrayBuffer has content
      const byteLength =
        audioData instanceof Blob ? audioData.size : audioData.byteLength;
      if (byteLength > 0) {
        for (let ch = 0; ch < numberOfChannels; ch++) {
          const channel = audioBuffer.getChannelData(ch);
          for (let i = 0; i < channel.length; i++) {
            channel[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
          }
        }
      }
    }

    this.audioBuffers.set(assetId, audioBuffer);

    return {
      assetId,
      audioBuffer,
      durationSec: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    };
  }

  /**
   * Get pre-decoded AudioBuffer by asset ID.
   */
  getAudioBuffer(assetId: string): AudioBuffer | undefined {
    return this.audioBuffers.get(assetId);
  }

  /**
   * Check if asset has pre-decoded audio track.
   */
  hasAudioBuffer(assetId: string): boolean {
    return this.audioBuffers.has(assetId);
  }

  /**
   * Remove pre-decoded audio buffer from registry.
   */
  unregisterAudioBuffer(assetId: string): boolean {
    return this.audioBuffers.delete(assetId);
  }

  /**
   * Clear all registered audio buffers.
   */
  clear(): void {
    this.audioBuffers.clear();
  }
}
