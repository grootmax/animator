export interface Canvas {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background?: string;
}

export interface Asset {
  id: string;
  type: "image" | "video" | "svg" | "lottie" | "font";
  src: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export type EaseName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInQuart"
  | "easeOutQuart"
  | "easeInOutQuart"
  | "easeInExpo"
  | "easeOutExpo"
  | "easeInOutExpo"
  | "easeOutBack"
  | "hold";

export interface Keyframe<T = number | [number, number] | string> {
  t: number; // in seconds
  v: T;
  ease?: EaseName | [number, number, number, number] | "hold";
}

export type KeyframeTrack = Keyframe[];

export interface Keyframes {
  [prop: string]: KeyframeTrack;
}

export interface PresetRef {
  name: string;
  at?: number;
  duration?: number;
  params?: Record<string, unknown>;
}

export interface RectShape {
  kind: "rect";
  size?: [number, number];
  radius?: number;
}

export interface CircleShape {
  kind: "circle" | "ellipse";
  size?: [number, number];
  radius?: number;
}

export interface LineShape {
  kind: "line";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: [number, number][];
}

export interface PolylineShape {
  kind: "polyline";
  points: [number, number][];
}

export interface PathShape {
  kind: "path";
  d: string;
}

export type ShapeDef =
  | RectShape
  | CircleShape
  | LineShape
  | PolylineShape
  | PathShape;

export type FillDef =
  | string
  | {
      color: string;
      opacity?: number;
    };

export interface StrokeDef {
  color: string;
  width: number;
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  opacity?: number;
}

export interface FontDef {
  family?: string;
  weight?: number;
  size?: number;
}

export type LayerType =
  | "shape"
  | "image"
  | "text"
  | "group"
  | "container"
  | "rect"
  | "circle"
  | "ellipse"
  | "line"
  | "polyline"
  | "path";

export interface Layer {
  id: string;
  name?: string;
  type: LayerType;
  position?: [number, number];
  anchor?: [number, number];
  scale?: [number, number];
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  in?: number;
  out?: number;
  parent?: string;
  keyframes?: Keyframes;
  presets?: PresetRef[];

  // Shape specific
  shape?: ShapeDef;
  size?: [number, number];
  radius?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: [number, number][];
  d?: string;
  fill?: FillDef;
  stroke?: StrokeDef;

  // Image specific
  asset?: string;

  // Text specific
  text?: string;
  font?: FontDef;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  native?: boolean;

  // Group specific
  children?: Layer[];
}

export interface ProjectData {
  version?: number;
  name?: string;
  canvas: Canvas;
  assets?: Asset[];
  layers: Layer[];
}
