import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix, identityMatrix } from '@monorepo/math';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline';

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  children: string[];
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

  // Internal state
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  lastUpdate: number;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  updateNodeInPlace: (id: string, key: string, value: number) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
}

const getDefaultNode = (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }): SceneNode => ({
  parentId: null,
  children: [],
  name: node.id,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  visible: true,
  locked: false,
  ...node,
  localMatrix: createMatrix(),
  worldMatrix: createMatrix(),
  isDirty: true
});

const TEMP_ROOT_MATRIX = createMatrix();

const traverseNodes = (nodes: Record<string, SceneNode>, nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
  const node = nodes[nodeId];
  if (!node) return;

  const isNowDirty = node.isDirty || parentWasDirty;
  let currentWorldMatrix = parentWorldMatrix;

  if (isNowDirty) {
    getTransformMatrix(
      node.localMatrix,
      node.x, node.y, 
      node.rotation, 
      node.scaleX, node.scaleY,
      node.skewX || 0, node.skewY || 0
    );
    multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
    currentWorldMatrix = node.worldMatrix;
  } else {
    currentWorldMatrix = node.worldMatrix;
  }

  for (let i = 0; i < node.children.length; i++) {
    traverseNodes(nodes, node.children[i], currentWorldMatrix, isNowDirty);
  }
};

export const createSceneGraphStore = () => createStore<SceneGraphState>((set, get) => ({
  nodes: {},
  rootId: null,
  lastUpdate: 0,

  addNode: (node) => {
    set((state) => {
      const newNode = getDefaultNode(node);
      const newNodes = { ...state.nodes, [node.id]: newNode };

      if (node.parentId) {
        const parent = newNodes[node.parentId];
        if (parent) {
          newNodes[node.parentId] = {
            ...parent,
            children: [...parent.children, node.id]
          };
        }
      }

      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
      };
    });
  },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      // In-place mutation for normal updates as well to stay consistent
      Object.assign(node, updates);
      node.isDirty = true;

      return { lastUpdate: performance.now() };
    });
  },

  updateNodeInPlace: (id, key, value) => {
    const node = get().nodes[id];
    if (!node) return;
    (node as any)[key] = value;
    node.isDirty = true;
  },

  reorderNode: (id, newParentId, index) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };

      if (node.parentId && newNodes[node.parentId]) {
        const parent = newNodes[node.parentId];
        newNodes[node.parentId] = {
          ...parent,
          children: parent.children.filter(childId => childId !== id)
        };
      }

      if (newParentId && newNodes[newParentId]) {
        const newParent = newNodes[newParentId];
        const newChildren = [...newParent.children];
        newChildren.splice(index, 0, id);
        newNodes[newParentId] = {
          ...newParent,
          children: newChildren
        };
      }

      node.parentId = newParentId;
      node.isDirty = true;

      return { nodes: newNodes, lastUpdate: performance.now() };
    });
  },

  markDirty: (id) => {
    const node = get().nodes[id];
    if (!node) return;
    node.isDirty = true;
    set({ lastUpdate: performance.now() });
  },

  recalculateMatrices: () => {
    const state = get();
    const { nodes, rootId } = state;

    if (!rootId || !nodes[rootId]) return;

    identityMatrix(TEMP_ROOT_MATRIX);
    traverseNodes(nodes, rootId, TEMP_ROOT_MATRIX, false);

    set({ lastUpdate: performance.now() });
  }
}));
