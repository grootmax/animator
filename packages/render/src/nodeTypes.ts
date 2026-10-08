export interface PaintStyle {
  fill?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeCap?: "butt" | "round" | "square";
  strokeJoin?: "miter" | "round" | "bevel";
  opacity?: number;
}

export interface BaseNode extends PaintStyle {
  id: string;
  name?: string;
  type: string;
  visible?: boolean;
  x?: number;
  y?: number;
  rotation?: number; // in degrees
  scaleX?: number;
  scaleY?: number;
  anchorX?: number;
  anchorY?: number;
}

export interface RectangleNode extends BaseNode {
  type: "rectangle" | "rect";
  width: number;
  height: number;
  cornerRadius?: number;
}

export interface CircleNode extends BaseNode {
  type: "circle";
  radius: number;
}

export interface EllipseNode extends BaseNode {
  type: "ellipse";
  radiusX: number;
  radiusY: number;
}

export interface PathNode extends BaseNode {
  type: "path";
  d: string; // SVG path data string
}

export interface LineNode extends BaseNode {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PolylineNode extends BaseNode {
  type: "polyline";
  points: Array<{ x: number; y: number }>;
}

export interface ImageNode extends BaseNode {
  type: "image";
  src?: string;
  width: number;
  height: number;
  imageBytes?: Uint8Array;
}

export interface GroupNode extends BaseNode {
  type: "group";
  children: SceneNode[];
}

export type SceneNode =
  | RectangleNode
  | CircleNode
  | EllipseNode
  | PathNode
  | LineNode
  | PolylineNode
  | ImageNode
  | GroupNode;

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number; // 1.0 = 100%
}

export type HandleType = "nw" | "ne" | "se" | "sw" | "rotate";

export interface TransformHandle {
  type: HandleType;
  x: number;
  y: number;
}

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
