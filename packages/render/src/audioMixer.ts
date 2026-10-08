import { AnimatorError } from "@animator/core";
import type { AssetRegistry } from "./assetRegistry.js";
import { MockOfflineAudioContext } from "./webAudioMock.js";

export interface AudioClipPlacement {
  assetId: string;
  startTime: number; // Start time on timeline in seconds
  mediaOffset?: number; // Offset into source audio buffer in seconds
  duration?: number; // Duration to play in seconds
  volume?: number; // Gain multiplier (1.0 = full volume)
}

export interface RenderAudioOptions {
  clips: AudioClipPlacement[];
  assetRegistry: AssetRegistry;
  duration: number; // Total composition duration in seconds
  sampleRate?: number; // Default 44100 Hz
  numberOfChannels?: number; // Default 2 channels (stereo)
  offlineAudioContextClass?: typeof OfflineAudioContext;
}

/**
 * Synthesizes all audio tracks placed on the composition timeline into a single
 * master PCM AudioBuffer using OfflineAudioContext.
 */
export async function renderCompositionAudio(
  options: RenderAudioOptions,
): Promise<AudioBuffer> {
  const {
    clips,
    assetRegistry,
    duration,
    sampleRate = 44100,
    numberOfChannels = 2,
    offlineAudioContextClass,
  } = options;

  if (duration <= 0) {
    throw new AnimatorError("Composition duration must be greater than 0", {
      code: "INVALID_DURATION",
      path: "audioMixer.renderCompositionAudio",
    });
  }

  const lengthSamples = Math.ceil(duration * sampleRate);

  let offlineCtx: OfflineAudioContext | MockOfflineAudioContext;

  const CtxClass =
    offlineAudioContextClass ??
    (typeof globalThis.OfflineAudioContext !== "undefined"
      ? globalThis.OfflineAudioContext
      : (MockOfflineAudioContext as unknown as typeof OfflineAudioContext));

  try {
    offlineCtx = new (
      CtxClass as unknown as new (
        channels: number,
        length: number,
        sampleRate: number,
      ) => OfflineAudioContext | MockOfflineAudioContext
    )(numberOfChannels, lengthSamples, sampleRate);
  } catch (_err) {
    offlineCtx = new MockOfflineAudioContext(
      numberOfChannels,
      lengthSamples,
      sampleRate,
    );
  }

  for (const clip of clips) {
    const audioBuffer = assetRegistry.getAudioBuffer(clip.assetId);
    if (!audioBuffer) {
      throw new AnimatorError(
        `Audio asset '${clip.assetId}' not found in asset registry`,
        {
          code: "ASSET_NOT_FOUND",
          path: `audioMixer.${clip.assetId}`,
          hint: "Ensure the audio track was pre-decoded and registered before export",
        },
      );
    }

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = clip.volume ?? 1.0;

    (source as unknown as { connect: (dest: unknown) => void }).connect(
      gainNode,
    );
    (gainNode as unknown as { connect: (dest: unknown) => void }).connect(
      offlineCtx.destination,
    );

    const startTime = clip.startTime;
    const mediaOffset = clip.mediaOffset ?? 0;
    const clipDuration = clip.duration ?? audioBuffer.duration - mediaOffset;

    source.start(startTime, mediaOffset, clipDuration);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer as AudioBuffer;
}
