import type { VideoFrameBitmap } from "../video/frameExtractor.js";

export interface ElectronMuxPayload {
  audio: {
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    pcmChannels: ArrayBuffer[]; // ArrayBuffers of Float32Array PCM data
  };
  frames: {
    timestampSec: number;
    width: number;
    height: number;
    frameIndex: number;
    data: ArrayBuffer; // ArrayBuffer of RGBA pixels
  }[];
  outputOptions?: {
    format?: "mp4" | "webm";
    outputPath?: string;
    fps?: number;
  };
}

export interface ElectronIPCBridge {
  invoke(channel: string, payload: ElectronMuxPayload): Promise<unknown>;
}

export const ELECTRON_MUX_IPC_CHANNEL = "mux-video-audio";

/**
 * Prepares IPC payload from synthesized AudioBuffer and extracted video frames.
 */
export function prepareMuxPayload(
  audioBuffer: AudioBuffer,
  frames: VideoFrameBitmap[],
  outputOptions?: ElectronMuxPayload["outputOptions"],
): ElectronMuxPayload {
  const pcmChannels: ArrayBuffer[] = [];

  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    pcmChannels.push((channelData.buffer as ArrayBuffer).slice(0));
  }

  const serializedFrames = frames.map((frame) => ({
    timestampSec: frame.timestampSec,
    width: frame.width,
    height: frame.height,
    frameIndex: frame.frameIndex,
    data: (frame.buffer.buffer as ArrayBuffer).slice(0),
  }));

  return {
    audio: {
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      pcmChannels,
    },
    frames: serializedFrames,
    ...(outputOptions !== undefined ? { outputOptions } : {}),
  };
}

/**
 * Passes the synthesized PCM audio buffers and video frame buffers to Electron main process.
 */
export async function passToElectronMuxer(
  ipcBridge: ElectronIPCBridge,
  audioBuffer: AudioBuffer,
  frames: VideoFrameBitmap[],
  outputOptions?: ElectronMuxPayload["outputOptions"],
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  try {
    const payload = prepareMuxPayload(audioBuffer, frames, outputOptions);
    const response = (await ipcBridge.invoke(
      ELECTRON_MUX_IPC_CHANNEL,
      payload,
    )) as { success: boolean; outputPath?: string } | undefined;

    return {
      success: response?.success ?? true,
      outputPath:
        response?.outputPath ?? outputOptions?.outputPath ?? "output.mp4",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const ElectronMuxerBridge = {
  IPC_CHANNEL: ELECTRON_MUX_IPC_CHANNEL,
  prepareMuxPayload,
  passToElectronMuxer,
};
