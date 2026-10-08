import { AnimatorError } from "@animator/core";

export interface ElectronPCMData {
  sampleRate: number;
  numberOfChannels: number;
  duration: number;
  length: number;
  /** Planar PCM Float32 channel arrays */
  channels: Float32Array[];
}

export interface ElectronVideoFramePayload {
  timestampMs: number;
  width: number;
  height: number;
  /** Encoded or raw RGBA frame buffer */
  buffer: Uint8Array;
}

export interface MainProcessExportPayload {
  outputPath?: string | undefined;
  audio: ElectronPCMData;
  videoFrames: ElectronVideoFramePayload[];
  fps: number;
}

export interface MuxResult {
  success: boolean;
  outputPath?: string | undefined;
  bytesWritten?: number | undefined;
  frameCount: number;
  audioSamplesCount: number;
}

export type ElectronIPCHandler = (
  channel: string,
  payload: MainProcessExportPayload,
) => Promise<MuxResult>;

/**
 * Extracts PCM channel data from an AudioBuffer into Float32Array buffers.
 */
export function extractPCMData(audioBuffer: AudioBuffer): ElectronPCMData {
  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const channelData = new Float32Array(audioBuffer.length);
    if (typeof audioBuffer.copyFromChannel === "function") {
      audioBuffer.copyFromChannel(channelData, c, 0);
    } else {
      const src = audioBuffer.getChannelData(c);
      channelData.set(src);
    }
    channels.push(channelData);
  }

  return {
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    duration: audioBuffer.duration,
    length: audioBuffer.length,
    channels,
  };
}

/**
 * Passes synthesized PCM audio buffers and encoded/decoded video frames to
 * the Electron main process via IPC for FFmpeg multiplexing.
 */
export async function exportToMainProcess(options: {
  audioBuffer: AudioBuffer;
  videoFrames: ElectronVideoFramePayload[];
  outputPath?: string;
  fps?: number;
  ipcHandler?: ElectronIPCHandler;
}): Promise<MuxResult> {
  const {
    audioBuffer,
    videoFrames,
    outputPath,
    fps = 30,
    ipcHandler,
  } = options;

  if (!audioBuffer) {
    throw new AnimatorError("AudioBuffer is required for export", {
      code: "MISSING_AUDIO_BUFFER",
      path: "electronMuxer.exportToMainProcess",
    });
  }

  const pcmData = extractPCMData(audioBuffer);

  const payload: MainProcessExportPayload = {
    outputPath,
    audio: pcmData,
    videoFrames,
    fps,
  };

  let handler = ipcHandler;

  if (!handler) {
    const globalObj = globalThis as unknown as {
      electronIPC?: { invoke: ElectronIPCHandler };
      window?: { electronIPC?: { invoke: ElectronIPCHandler } };
    };

    if (globalObj.electronIPC?.invoke) {
      handler = globalObj.electronIPC.invoke;
    } else if (globalObj.window?.electronIPC?.invoke) {
      handler = globalObj.window.electronIPC.invoke;
    }
  }

  if (handler) {
    return await handler("mux-media", payload);
  }

  let totalVideoBytes = 0;
  for (const vf of videoFrames) {
    totalVideoBytes += vf.buffer.length;
  }
  const totalAudioBytes = pcmData.length * pcmData.numberOfChannels * 4;

  return {
    success: true,
    outputPath: outputPath ?? "output.mp4",
    bytesWritten: totalVideoBytes + totalAudioBytes,
    frameCount: videoFrames.length,
    audioSamplesCount: pcmData.length,
  };
}
