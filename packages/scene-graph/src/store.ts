import { createStore } from "zustand/vanilla";

export type NodeType =
  | "container"
  | "rect"
  | "circle"
  | "path"
  | "group"
  | "ellipse"
  | "line"
  | "polyline"
  | "image"
  | "video";

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  children: string[];
  order?: string;
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

  // Video node properties
  assetId?: string;
  startTime?: number;
  mediaOffset?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
  loop?: boolean;

  localMatrix?: number[];
  worldMatrix?: number[];
  isDirty?: boolean;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  addNode: (node: Partial<SceneNode> & { id: string; type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  removeNode: (id: string) => void;
}

export const getDefaultNode = (
  node: Partial<SceneNode> & { id: string; type: NodeType },
): SceneNode => {
  const baseDefaults: SceneNode = {
    name: node.name || node.id,
    parentId: node.parentId ?? null,
    children: node.children || [],
    x: node.x ?? 0,
    y: node.y ?? 0,
    rotation: node.rotation ?? 0,
    scaleX: node.scaleX ?? 1,
    scaleY: node.scaleY ?? 1,
    opacity: node.opacity ?? 1,
    visible: node.visible ?? true,
    locked: node.locked ?? false,
    ...node,
    id: node.id,
    type: node.type,
  };

  if (node.type === "video") {
    return {
      startTime: 0,
      mediaOffset: 0,
      duration: 0,
      volume: 1,
      muted: false,
      loop: false,
      ...baseDefaults,
    };
  }

  return baseDefaults;
};

export const createSceneGraphStore = () =>
  createStore<SceneGraphState>((set) => ({
    nodes: {},
    rootId: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,

    addNode: (node) =>
      set((state) => {
        const fullNode = getDefaultNode(node);
        return {
          nodes: { ...state.nodes, [node.id]: fullNode },
          rootId:
            state.rootId ||
            (fullNode.parentId === null ? fullNode.id : state.rootId),
        };
      }),

    updateNode: (id, updates) =>
      set((state) => {
        const existing = state.nodes[id];
        if (!existing) return state;
        return {
          nodes: {
            ...state.nodes,
            [id]: { ...existing, ...updates },
          },
        };
      }),

    removeNode: (id) =>
      set((state) => {
        const newNodes = { ...state.nodes };
        delete newNodes[id];
        return { nodes: newNodes };
      }),
  }));
