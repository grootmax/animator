import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';

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
  dirtySet: Set<string>;
  version: number;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
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

export const createSceneGraphStore = () => createStore<SceneGraphState>((set, get) => ({
  nodes: {},
  rootId: null,
  dirtySet: new Set<string>(),
  version: 0,

  addNode: (node) => {
    set((state) => {
      const newNode = getDefaultNode(node);
      state.nodes[node.id] = newNode;
      state.dirtySet.add(node.id);

      if (node.parentId) {
        const parent = state.nodes[node.parentId];
        if (parent) {
          parent.children.push(node.id);
          parent.isDirty = true;
          state.dirtySet.add(parent.id);
        }
      }

      return {
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
        version: state.version + 1
      };
    });
  },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      Object.assign(node, updates);
      node.isDirty = true;
      state.dirtySet.add(id);

      return { version: state.version + 1 };
    });
  },

  reorderNode: (id, newParentId, index) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      // Remove from old parent
      if (node.parentId && state.nodes[node.parentId]) {
        const parent = state.nodes[node.parentId];
        const idx = parent.children.indexOf(id);
        if (idx !== -1) {
          parent.children.splice(idx, 1);
        }
        parent.isDirty = true;
        state.dirtySet.add(parent.id);
      }

      // Add to new parent
      if (newParentId && state.nodes[newParentId]) {
        const newParent = state.nodes[newParentId];
        newParent.children.splice(index, 0, id);
        newParent.isDirty = true;
        state.dirtySet.add(newParent.id);
      }

      node.parentId = newParentId;
      node.isDirty = true;
      state.dirtySet.add(id);

      return { version: state.version + 1 };
    });
  },

  markDirty: (id) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      node.isDirty = true;
      state.dirtySet.add(id);

      return { version: state.version + 1 };
    });
  },

  recalculateMatrices: () => {
    set((state) => {
      const { rootId, nodes, dirtySet } = state;

      if (!rootId || !nodes[rootId]) return state;

      let changed = false;

      const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const node = nodes[nodeId];
        if (!node) return;

        const isNowDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isNowDirty) {
          node.localMatrix = getTransformMatrix(
            node.x, node.y, 
            node.rotation, 
            node.scaleX, node.scaleY,
            node.skewX || 0, node.skewY || 0
          );
          currentWorldMatrix = multiplyMatrix(parentWorldMatrix, node.localMatrix);

          node.worldMatrix = currentWorldMatrix;
          node.isDirty = false;
          dirtySet.add(nodeId);
          changed = true;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        for (const childId of node.children) {
          traverse(childId, currentWorldMatrix, isNowDirty);
        }
      };

      traverse(rootId, createMatrix(), false);

      if (changed) {
        return { version: state.version + 1 };
      }
      return state as any; // return undefined to signify no state change to zustand (or state)
    });
  }
}));
