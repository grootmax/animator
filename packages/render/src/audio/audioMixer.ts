import { type AssetRegistry, MockAudioBuffer } from "./assetRegistry.js";

export interface AudioPlacement {
  assetId: string;
  startTime: number; // seconds on project timeline
  mediaOffset: number; // offset into source audio asset in seconds
  duration: number; // active play duration in seconds
  volume?: number; // gain 0..1, default 1.0
}

export interface AudioMixerOptions {
  sampleRate?: number;
  numberOfChannels?: number;
}

export class OfflineAudioMixer {
  private sampleRate: number;
  private numberOfChannels: number;

  constructor(options?: AudioMixerOptions) {
    this.sampleRate = options?.sampleRate ?? 44100;
    this.numberOfChannels = options?.numberOfChannels ?? 2;
  }

  /**
   * Synthesizes audio timeline placements into a single master AudioBuffer.
   */
  async renderCompositionAudio(
    placements: AudioPlacement[],
    assetRegistry: AssetRegistry,
    compositionDurationSec: number,
  ): Promise<AudioBuffer> {
    const length = Math.max(
      1,
      Math.round(compositionDurationSec * this.sampleRate),
    );

    // Check if WebAudio OfflineAudioContext is globally available
    if (typeof globalThis.OfflineAudioContext !== "undefined") {
      const OfflineCtxClass = globalThis.OfflineAudioContext;
      const offlineCtx = new OfflineCtxClass(
        this.numberOfChannels,
        length,
        this.sampleRate,
      );

      for (const placement of placements) {
        const audioBuffer = assetRegistry.getAudioBuffer(placement.assetId);
        if (!audioBuffer) continue;

        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;

        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = placement.volume ?? 1.0;

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        source.start(
          placement.startTime,
          placement.mediaOffset,
          placement.duration,
        );
      }

      return await offlineCtx.startRendering();
    }

    // Pure JavaScript offline audio synthesis fallback for headless / Node test runner
    const masterBuffer = new MockAudioBuffer({
      numberOfChannels: this.numberOfChannels,
      length,
      sampleRate: this.sampleRate,
    });

    for (const placement of placements) {
      const audioBuffer = assetRegistry.getAudioBuffer(placement.assetId);
      if (!audioBuffer) continue;

      const gain = placement.volume ?? 1.0;
      const startSample = Math.max(
        0,
        Math.round(placement.startTime * this.sampleRate),
      );
      const mediaOffsetSample = Math.max(
        0,
        Math.round(placement.mediaOffset * audioBuffer.sampleRate),
      );
      const durationSamples = Math.round(placement.duration * this.sampleRate);

      const srcLength = audioBuffer.length;
      const channels = Math.min(
        this.numberOfChannels,
        audioBuffer.numberOfChannels,
      );

      for (let ch = 0; ch < channels; ch++) {
        const srcData = audioBuffer.getChannelData(ch);
        const destData = masterBuffer.getChannelData(ch);

        for (let i = 0; i < durationSamples; i++) {
          const srcIdx = mediaOffsetSample + i;
          const destIdx = startSample + i;

          if (srcIdx >= srcLength || destIdx >= length) break;

          const srcVal = srcData[srcIdx] ?? 0;
          const currentDest = destData[destIdx] ?? 0;
          destData[destIdx] = currentDest + srcVal * gain;
        }
      }
    }

    return masterBuffer;
  }

  /**
   * Extract PCM channel Float32Arrays from synthesized AudioBuffer.
   */
  static extractPCMChannels(buffer: AudioBuffer): Float32Array[] {
    const channels: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    return channels;
  }

  /**
   * Convert AudioBuffer to WAV format ArrayBuffer for FFmpeg / disk export.
   */
  static encodeWAV(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const length = buffer.length;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataByteLength = length * blockAlign;
    const headerByteLength = 44;
    const totalByteLength = headerByteLength + dataByteLength;

    const arrayBuffer = new ArrayBuffer(totalByteLength);
    const view = new DataView(arrayBuffer);

    // Helper writing string
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    /* RIFF identifier */
    writeString(0, "RIFF");
    /* RIFF chunk length */
    view.setUint32(4, 36 + dataByteLength, true);
    /* RIFF type */
    writeString(8, "WAVE");
    /* format chunk identifier */
    writeString(12, "fmt ");
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw PCM) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true);
    /* block align */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(36, "data");
    /* data chunk length */
    view.setUint32(40, dataByteLength, true);

    // Interleave channels & write 16-bit PCM
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const channel = channels[c];
        const sample = channel ? (channel[i] ?? 0) : 0;
        const clamped = Math.max(-1, Math.min(1, sample));
        const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }
}
