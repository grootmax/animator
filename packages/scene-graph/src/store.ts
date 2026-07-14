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
  bufferIndex: number;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  sharedBuffer: SharedArrayBuffer | ArrayBuffer;
  nextBufferIndex: number;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
}

const MAX_NODES = 100000;
const FLOATS_PER_NODE = 18;
const createBuffer = () => {
  if (typeof SharedArrayBuffer !== 'undefined') {
    try {
      return new SharedArrayBuffer(MAX_NODES * FLOATS_PER_NODE * 4);
    } catch (e) {
      console.warn('Failed to create SharedArrayBuffer', e);
    }
  }
  console.warn('SharedArrayBuffer not available, falling back to ArrayBuffer');
  return new ArrayBuffer(MAX_NODES * FLOATS_PER_NODE * 4);
};

const getDefaultNode = (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType }, bufferIndex: number): SceneNode => ({
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
  bufferIndex
});

export const createSceneGraphStore = () => {
  const initialBuffer = createBuffer();
  const sharedMatrices = new Float32Array(initialBuffer);

  return createStore<SceneGraphState>((set, get) => ({
    nodes: {},
    rootId: null,
    sharedBuffer: initialBuffer,
    nextBufferIndex: 0,

    addNode: (node) => {
      set((state) => {
        const bufferIndex = state.nextBufferIndex;
        const newNode = getDefaultNode(node, bufferIndex);
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
          rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
          nextBufferIndex: bufferIndex + 1
        };
      });
    },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      // O(1) dirty marking: just mark the current node.
      // The recalculate step will propagate this to children automatically!
      const newNodes = { ...state.nodes, [id]: { ...node, ...updates, isDirty: true } };

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
        let localMatrix = node.localMatrix;

        if (isNowDirty) {
          localMatrix = getTransformMatrix(
            node.x, node.y, 
            node.rotation, 
            node.scaleX, node.scaleY,
            node.skewX || 0, node.skewY || 0
          );
          currentWorldMatrix = multiplyMatrix(parentWorldMatrix, localMatrix);

          newNodes[nodeId] = {
            ...node,
            localMatrix,
            worldMatrix: currentWorldMatrix,
            isDirty: false
          };
          
          // Write directly to shared memory array
          const offset = node.bufferIndex * FLOATS_PER_NODE;
          sharedMatrices.set(localMatrix, offset);
          sharedMatrices.set(currentWorldMatrix, offset + 9);
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
};
