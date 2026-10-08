export type EasingType =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad";

export interface Keyframe {
  id?: string;
  time: number; // in milliseconds
  value: number | string;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property:
    | "x"
    | "y"
    | "rotation"
    | "scaleX"
    | "scaleY"
    | "opacity"
    | "fill"
    | "stroke"
    | "pathData"
    | string;
  keyframes: Keyframe[];
}

export type NodeType =
  | "container"
  | "rect"
  | "circle"
  | "path"
  | "group"
  | "ellipse"
  | "line"
  | "polyline"
  | "image";

export type Matrix3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  order: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX?: number;
  skewY?: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  width?: number;
  height?: number;
  radius?: number;
  pathData?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: string;
  src?: string;

  // Internal state
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
}

export type NetworkRole = "standalone" | "leader" | "follower";

export interface Heartbeat {
  playhead: number;
  isPlaying: boolean;
  timestamp: number;
}
