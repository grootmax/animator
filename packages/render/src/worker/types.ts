export interface Keyframe {
  time: number; // in seconds
  position?: [number, number] | undefined;
  opacity?: number | undefined; // 0 to 1
  scale?: [number, number] | undefined;
  fill?: string | undefined;
}

export interface SceneLayer {
  id: string;
  type: "shape" | "rect" | "text" | "image";
  position: [number, number];
  size?: [number, number] | undefined;
  fill?: string | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  opacity?: number | undefined;
  scale?: [number, number] | undefined;
  text?: string | undefined;
  fontSize?: number | undefined;
  assetId?: string | undefined;
  keyframes?: Keyframe[] | undefined;
}

export interface SceneData {
  width: number;
  height: number;
  fps: number;
  duration: number; // in seconds
  background?: string | undefined;
  layers: SceneLayer[];
}

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  codec?: string | undefined;
  bitrate?: number | undefined;
}

// Worker Protocol Messages

export interface WorkerInitMessage {
  type: "init";
  sceneData: SceneData;
  options: ExportOptions;
  canvas?: OffscreenCanvas | undefined;
  assets?: Record<string, ImageBitmap | ArrayBuffer> | undefined;
}

export interface WorkerCancelMessage {
  type: "cancel";
}

export type ExportMessageToWorker = WorkerInitMessage | WorkerCancelMessage;

export interface MainProgressMessage {
  type: "progress";
  frame: number;
  totalFrames: number;
  percent: number;
}

export interface MainChunkMessage {
  type: "chunk";
  data: ArrayBuffer;
  timestamp: number;
  isKeyFrame: boolean;
}

export interface MainCompleteMessage {
  type: "complete";
  totalFrames: number;
  durationMs: number;
  chunksCount: number;
  blob?: Blob | undefined;
}

export interface MainErrorMessage {
  type: "error";
  error: string;
}

export type ExportMessageFromWorker =
  | MainProgressMessage
  | MainChunkMessage
  | MainCompleteMessage
  | MainErrorMessage;
