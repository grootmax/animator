export type KeyframeValue = number | string | number[] | string[];

export type EasingDefinition =
  | string
  | [number, number, number, number]
  | "hold"
  | "linear"
  | { x1: number; y1: number; x2: number; y2: number };

export interface Keyframe<T = KeyframeValue> {
  id: string;
  time: number; // in seconds
  value: T; // numeric, hex color string, SVG path string, or vector/array
  easing?: EasingDefinition;
}

export interface Track {
  id: string;
  targetId: string;
  property: string;
  keyframes: Keyframe[];
}

export interface MotionDocCanvas {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background?: string;
}

export interface MotionDocLayer {
  id: string;
  name?: string;
  type: string;
  position?: [number, number];
  scale?: [number, number];
  rotation?: number;
  opacity?: number;
  keyframes?: Record<string, Keyframe[]>;
  tracks?: Track[];
  [key: string]: unknown;
}

export interface MotionDoc {
  version: number;
  name: string;
  canvas: MotionDocCanvas;
  layers: MotionDocLayer[];
  tracks?: Track[];
  [key: string]: unknown;
}

export interface MotionState {
  doc: MotionDoc;
  playhead: number; // in seconds
  isPlaying: boolean;
  fps: number;
  nodeProperties: Record<string, Record<string, unknown>>;
}

export type MotionPatch =
  | { type: "SET_PLAYHEAD"; playhead: number }
  | { type: "SET_PLAYING"; isPlaying: boolean }
  | {
      type: "UPDATE_KEYFRAME";
      trackId?: string;
      layerId?: string;
      property?: string;
      keyframe: Keyframe;
    }
  | {
      type: "ADD_KEYFRAME";
      trackId?: string;
      layerId?: string;
      property?: string;
      keyframe: Keyframe;
    }
  | {
      type: "REMOVE_KEYFRAME";
      keyframeId: string;
      trackId?: string;
      layerId?: string;
      property?: string;
    }
  | {
      type: "UPDATE_NODE_PROPERTY";
      nodeId: string;
      property: string;
      value: unknown;
    }
  | { type: "TICK"; deltaTime: number; playhead?: number }
  | { type: "SET_DOC"; doc: MotionDoc };
