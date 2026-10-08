export interface Canvas {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
}

export type ParamType = "color" | "text" | "number";

export interface Param {
  type: ParamType;
  value: string | number;
  label: string;
}

export interface Stroke {
  color: string;
  width: number;
  cap?: "butt" | "round" | "square";
}

export interface Shape {
  kind: "rect" | "ellipse" | "path";
  size?: [number, number];
  radius?: number;
  d?: string;
}

export interface Font {
  family: string;
  weight: number;
  size: number;
}

export type LayerType = "shape" | "text" | "image" | "group" | "lottie";

export interface Layer {
  id: string;
  type: LayerType;
  name?: string;
  position?: [number, number];
  scale?: [number, number];
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  fill?: string;
  stroke?: Stroke;
  shape?: Shape;
  text?: string;
  font?: Font;
  align?: "left" | "center" | "right";
  children?: Layer[];
}

export interface MotionDoc {
  version: number;
  name: string;
  canvas: Canvas;
  params: Record<string, Param>;
  layers: Layer[];
}

export type Op =
  | { op: "setCanvas"; set: Partial<Canvas> }
  | { op: "addLayer"; layer: Layer; index?: number }
  | { op: "updateLayer"; id: string; set: Partial<Layer> }
  | { op: "removeLayer"; id: string }
  | { op: "moveLayer"; id: string; index: number }
  | { op: "setParam"; name: string; param: Param | null };

export interface ApplyOpsResult {
  doc: MotionDoc;
  inverseOps: Op[];
}
