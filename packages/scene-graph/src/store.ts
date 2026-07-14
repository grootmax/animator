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
  appearanceDirty: boolean;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'appearanceDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'appearanceDirty'>>) => void;
  updateNodes: (updates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'appearanceDirty'>>>) => void;
  clearDirtyFlags: (nodeIds: string[]) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
}

const getDefaultNode = (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'appearanceDirty'>> & { id: string, type: NodeType }): SceneNode => ({
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
  isDirty: true,
  appearanceDirty: true
});

export const createSceneGraphStore = () => createStore<SceneGraphState>((set, get) => ({
  nodes: {},
  rootId: null,

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

  updateNodes: (updates) => {
    set((state) => {
      const newNodes = { ...state.nodes };
      let hasChanges = false;
      const appearanceProps = ['opacity', 'visible', 'width', 'height', 'radius', 'pathData', 'fill', 'stroke', 'strokeWidth', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];

      for (const [id, nodeUpdates] of Object.entries(updates)) {
        const node = newNodes[id];
        if (node) {
          let appearanceDirty = node.appearanceDirty;
          let transformDirty = node.isDirty;
          for (const key of Object.keys(nodeUpdates)) {
            if (appearanceProps.includes(key)) {
              appearanceDirty = true;
            } else {
              transformDirty = true;
            }
          }
          newNodes[id] = { ...node, ...nodeUpdates, isDirty: transformDirty, appearanceDirty };
          hasChanges = true;
        }
      }

      return hasChanges ? { nodes: newNodes } : state;
    });
  },

  clearDirtyFlags: (nodeIds) => {
    set((state) => {
      const newNodes = { ...state.nodes };
      let changed = false;
      for (const id of nodeIds) {
        if (newNodes[id] && (newNodes[id].isDirty || newNodes[id].appearanceDirty)) {
          newNodes[id] = { ...newNodes[id], isDirty: false, appearanceDirty: false };
          changed = true;
        }
      }
      return changed ? { nodes: newNodes } : state;
    });
  },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const appearanceProps = ['opacity', 'visible', 'width', 'height', 'radius', 'pathData', 'fill', 'stroke', 'strokeWidth', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
      let appearanceDirty = node.appearanceDirty;
      let transformDirty = node.isDirty;

      for (const key of Object.keys(updates)) {
        if (appearanceProps.includes(key)) {
          appearanceDirty = true;
        } else {
          transformDirty = true;
        }
      }

      const newNodes = { ...state.nodes, [id]: { ...node, ...updates, isDirty: transformDirty, appearanceDirty } };

      return { nodes: newNodes };
    });
  },

  reorderNode: (id, newParentId, index) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };

      // Remove from old parent
      if (node.parentId && newNodes[node.parentId]) {
        const parent = newNodes[node.parentId];
        newNodes[node.parentId] = {
          ...parent,
          children: parent.children.filter(childId => childId !== id)
        };
      } else if (!node.parentId && id !== state.rootId) {
          // It was a root child, handle root node if we support multiple roots.
          // In our setup rootId is one node. Wait, rootId might be a single node.
          // We can assume scene has a main root container.
      }

      // Add to new parent
      if (newParentId && newNodes[newParentId]) {
        const newParent = newNodes[newParentId];
        const newChildren = [...newParent.children];
        newChildren.splice(index, 0, id);
        newNodes[newParentId] = {
          ...newParent,
          children: newChildren
        };
      }

      newNodes[id] = { ...node, parentId: newParentId, isDirty: true };

      return { nodes: newNodes };
    });
  },

  markDirty: (id) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      // O(1) dirty marking
      const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };

      return { nodes: newNodes };
    });
  },

  recalculateMatrices: () => {
    set((state) => {
      const newNodes = { ...state.nodes };
      const { rootId } = state;

      if (!rootId || !newNodes[rootId]) return state;

      const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const node = newNodes[nodeId];
        if (!node) return;

        const isNowDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isNowDirty) {
          const localMatrix = getTransformMatrix(
            node.x, node.y, 
            node.rotation, 
            node.scaleX, node.scaleY,
            node.skewX || 0, node.skewY || 0
          );
          currentWorldMatrix = multiplyMatrix(parentWorldMatrix, localMatrix);

          newNodes[nodeId] = {
            ...node,
            localMatrix,
            worldMatrix: currentWorldMatrix
          };
        } else {
            currentWorldMatrix = node.worldMatrix;
        }

        for (const childId of node.children) {
          traverse(childId, currentWorldMatrix, isNowDirty);
        }
      };

      traverse(rootId, createMatrix(), false);

      return { nodes: newNodes };
    });
  }
}));
