import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline';

export interface TransientNodeState {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  opacity: number;
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
  isRenderDirty: boolean; // Flag to tell the renderer it needs syncing
}

export const transientState: Record<string, TransientNodeState> = {};

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  children: string[];
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
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  addNode: (node: Partial<SceneNode & Omit<TransientNodeState, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'isRenderDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children'>>) => void;
  updateTransientNode: (id: string, updates: Partial<Omit<TransientNodeState, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'isRenderDirty'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
}

const getDefaultNode = (node: Partial<SceneNode & Omit<TransientNodeState, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'isRenderDirty'>> & { id: string, type: NodeType }): SceneNode => {
  const {
    x, y, rotation, scaleX, scaleY, skewX, skewY, opacity,
    ...rest
  } = node;
  
  return {
    parentId: null,
    children: [],
    name: node.id,
    visible: true,
    locked: false,
    ...rest
  };
};

export const createSceneGraphStore = () => createStore<SceneGraphState>((set, get) => ({
  nodes: {},
  rootId: null,

  addNode: (node) => {
    // Add to transient state mutably
    transientState[node.id] = {
      x: node.x ?? 0,
      y: node.y ?? 0,
      rotation: node.rotation ?? 0,
      scaleX: node.scaleX ?? 1,
      scaleY: node.scaleY ?? 1,
      skewX: node.skewX ?? 0,
      skewY: node.skewY ?? 0,
      opacity: node.opacity ?? 1,
      localMatrix: createMatrix(),
      worldMatrix: createMatrix(),
      isDirty: true,
      isRenderDirty: true
    };

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

      const newNodes = { ...state.nodes, [id]: { ...node, ...updates } };
      return { nodes: newNodes };
    });
  },

  updateTransientNode: (id, updates) => {
    const tNode = transientState[id];
    if (tNode) {
      Object.assign(tNode, updates);
      tNode.isDirty = true;
      tNode.isRenderDirty = true;
    }
  },

  reorderNode: (id, newParentId, index) => {
    transientState[id].isDirty = true;
    
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

      newNodes[id] = { ...node, parentId: newParentId };
      return { nodes: newNodes };
    });
  },

  markDirty: (id) => {
    if (transientState[id]) {
      transientState[id].isDirty = true;
      transientState[id].isRenderDirty = true;
    }
  },

  recalculateMatrices: () => {
    const { nodes, rootId } = get();
    if (!rootId || !nodes[rootId]) return;

    const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
      const node = nodes[nodeId];
      const tNode = transientState[nodeId];
      if (!node || !tNode) return;

      const isNowDirty = tNode.isDirty || parentWasDirty;
      let currentWorldMatrix = parentWorldMatrix;

      if (isNowDirty) {
        if (tNode.isDirty) {
          getTransformMatrix(
            tNode.localMatrix,
            tNode.x, tNode.y, 
            tNode.rotation, 
            tNode.scaleX, tNode.scaleY,
            tNode.skewX, tNode.skewY
          );
        }
        multiplyMatrix(tNode.worldMatrix, parentWorldMatrix, tNode.localMatrix);
        currentWorldMatrix = tNode.worldMatrix;

        tNode.isDirty = false;
        // Do NOT set isRenderDirty to false here, renderer clears it after sync
      } else {
        currentWorldMatrix = tNode.worldMatrix;
      }

      for (const childId of node.children) {
        traverse(childId, currentWorldMatrix, isNowDirty);
      }
    };

    traverse(rootId, createMatrix(), false);
  }
}));
