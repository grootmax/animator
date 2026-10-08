export type Matrix3 = number[];

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
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  viewport: ViewportState;
  selectedNodeId: string | null;
  remoteSelections: Record<
    string,
    { nodeId: string; color: string; userName?: string }
  >;
  setViewport: (viewport: ViewportState) => void;
  setSelectedNodeId: (id: string | null) => void;
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  recalculateMatrices: () => void;
  commitHistory: () => void;
}

export interface SceneGraphStore {
  getState: () => SceneGraphState;
  subscribe: (listener: (state: SceneGraphState) => void) => () => void;
}

export interface PathToken {
  type: string;
  args: number[];
}

export function tokenizePath(pathData: string): PathToken[] {
  const tokens: PathToken[] = [];
  const regex = /([a-zA-Z])([^a-zA-Z]*)/g;
  let match: RegExpExecArray | null = regex.exec(pathData);
  while (match !== null) {
    const type = match[1] ?? "";
    const argStr = match[2] ?? "";
    const args = argStr
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map(Number);
    tokens.push({ type, args });
    match = regex.exec(pathData);
  }
  return tokens;
}
