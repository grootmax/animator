export interface CanvasConfig {
  width: number;
  height: number;
  fps: number;
  duration: number; // in seconds
  background?: string; // hex color e.g. "#0B1020"
}

export type LayerType = "shape" | "image" | "text" | "group";

export interface ShapeDef {
  kind: "rect" | "ellipse" | "path";
  size?: [number, number];
  radius?: number;
  d?: string;
}

export interface Layer {
  id: string;
  name?: string;
  type: LayerType;
  position?: [number, number];
  size?: [number, number];
  opacity?: number; // 0-100
  fill?: string; // hex color e.g. "#FF5A5F"
  stroke?: {
    color: string;
    width: number;
  };
  shape?: ShapeDef;
  text?: string;
}

export interface MotionDoc {
  version: number;
  name: string;
  canvas: CanvasConfig;
  layers: Layer[];
}

export type Op =
  | { op: "setCanvas"; set: Partial<CanvasConfig> }
  | { op: "addLayer"; layer: Layer; index?: number }
  | { op: "updateLayer"; id: string; set: Partial<Layer> }
  | { op: "removeLayer"; id: string }
  | { op: "moveLayer"; id: string; index: number };

export interface ApplyOpsResult {
  doc: MotionDoc;
  revision: number;
  changedIds: string[];
}
