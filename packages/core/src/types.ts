export class AnimatorError extends Error {
  code: string;
  path?: string | undefined;
  hint?: string | undefined;

  constructor(
    message: string,
    options: {
      code: string;
      path?: string | undefined;
      hint?: string | undefined;
    },
  ) {
    super(message);
    this.name = "AnimatorError";
    this.code = options.code;
    if (options.path !== undefined) {
      this.path = options.path;
    }
    if (options.hint !== undefined) {
      this.hint = options.hint;
    }
  }
}

export interface Canvas {
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor?: string;
}

export interface Keyframe {
  t: number;
  v: unknown;
  ease?: string | [number, number, number, number] | "hold";
}

export interface PresetRef {
  name: string;
  at?: number;
  duration?: number;
  params?: Record<string, unknown>;
}

export type LayerType = "shape" | "text" | "image" | "group" | "lottie";

export interface Layer {
  id: string;
  type: LayerType;
  name?: string;
  position?: [number, number];
  anchor?: [number, number] | "center";
  scale?: [number, number];
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  blend?: string;
  in?: number;
  out?: number;
  parent?: string | null;
  keyframes?: Record<string, Keyframe[]>;
  presets?: PresetRef[];
  [key: string]: unknown;
}

export interface Stagger {
  name: "stagger";
  targets: string[];
  preset: string;
  at: number;
  step: number;
}

export interface Param {
  type: "color" | "text" | "number";
  value: unknown;
}

export interface Asset {
  id: string;
  type: "image" | "font" | "video" | "lottie";
  src: string;
  [key: string]: unknown;
}

export interface VideoClip {
  id: string;
  asset: string;
  at: number;
  trimIn?: number;
  duration: number;
  placement?: "under" | "over";
}

export interface MotionDoc {
  formatVersion?: number;
  revision?: number;
  canvas: Canvas;
  layers: Layer[];
  videoTrack?: VideoClip[];
  params?: Record<string, Param>;
  assets?: Asset[];
  staggers?: Stagger[];
}

export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

export type Op =
  | { op: "setCanvas"; set: Partial<Canvas> }
  | { op: "addLayer"; layer: Layer; parent?: string | null; index?: number }
  | { op: "updateLayer"; id: string; set: DeepPartial<Layer> }
  | { op: "removeLayer"; id: string }
  | { op: "moveLayer"; id: string; parent?: string | null; index: number }
  | {
      op: "setKeyframes";
      id: string;
      prop: string;
      keyframes: Keyframe[] | null;
    }
  | { op: "addPreset"; id: string; preset: PresetRef }
  | { op: "removePreset"; id: string; index: number }
  | { op: "addStagger"; stagger: Stagger }
  | { op: "setParam"; name: string; param: Param | null }
  | { op: "addAsset"; asset: Asset }
  | { op: "removeAsset"; id: string }
  | { op: "setVideoTrack"; clips: VideoClip[] };

export interface ApplyOpsOptions {
  source?: string;
  baseRevision?: number;
}

export interface ApplyOpsResult {
  doc: MotionDoc;
  revision: number;
  changedIds: string[];
  inversePatches: Op[];
  warnings: string[];
}
