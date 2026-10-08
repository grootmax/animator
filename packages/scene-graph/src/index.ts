import type { Matrix3 } from "@monorepo/math";

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
  localMatrix?: Matrix3;
  worldMatrix?: Matrix3;
  isDirty?: boolean;
}

export const transientState = Symbol("transientState");
