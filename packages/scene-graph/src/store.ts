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
  modifiedNodes: Set<string>;
  deletedNodes: Set<string>;
  loadProject: (nodes: Record<string, SceneNode>, rootId: string | null) => void;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  deleteNode: (id: string) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  clearSaveDeltas: () => void;
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
  modifiedNodes: new Set<string>(),
  deletedNodes: new Set<string>(),

  loadProject: (nodes, rootId) => {
    const newNodes: Record<string, SceneNode> = {};
    for (const [id, node] of Object.entries(nodes)) {
      newNodes[id] = {
        ...node,
        localMatrix: createMatrix(),
        worldMatrix: createMatrix(),
        isDirty: true
      };
    }
    set({
      nodes: newNodes,
      rootId,
      modifiedNodes: new Set(),
      deletedNodes: new Set()
    });
  },

  addNode: (node) => {
    set((state) => {
      const newNode = getDefaultNode(node);
      const newNodes = { ...state.nodes, [node.id]: newNode };
      const newModified = new Set(state.modifiedNodes);
      
      newModified.add(node.id);

      if (node.parentId) {
        const parent = newNodes[node.parentId];
        if (parent) {
          newNodes[node.parentId] = {
            ...parent,
            children: [...parent.children, node.id]
          };
          newModified.add(node.parentId);
        }
      }

      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
        modifiedNodes: newModified
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
      
      const newModified = new Set(state.modifiedNodes);
      newModified.add(id);

      return { nodes: newNodes, modifiedNodes: newModified };
    });
  },

  reorderNode: (id, newParentId, index) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };
      const newModified = new Set(state.modifiedNodes);
      newModified.add(id);

      // Remove from old parent
      if (node.parentId && newNodes[node.parentId]) {
        const parent = newNodes[node.parentId];
        newNodes[node.parentId] = {
          ...parent,
          children: parent.children.filter(childId => childId !== id)
        };
        newModified.add(node.parentId);
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
        newModified.add(newParentId);
      }

      newNodes[id] = { ...node, parentId: newParentId, isDirty: true };

      return { nodes: newNodes, modifiedNodes: newModified };
    });
  },

  deleteNode: (id: string) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };
      const newDeleted = new Set(state.deletedNodes);
      const newModified = new Set(state.modifiedNodes);

      const deleteRecursively = (nodeId: string) => {
        const n = newNodes[nodeId];
        if (!n) return;
        for (const childId of n.children) {
          deleteRecursively(childId);
        }
        delete newNodes[nodeId];
        newDeleted.add(nodeId);
        newModified.delete(nodeId);
      };

      // Remove from parent
      if (node.parentId && newNodes[node.parentId]) {
        const parent = newNodes[node.parentId];
        newNodes[node.parentId] = {
          ...parent,
          children: parent.children.filter(childId => childId !== id)
        };
        newModified.add(node.parentId);
      }

      // If it's the root, maybe we shouldn't allow deleting it or handle it gracefully
      if (id === state.rootId) {
        // usually we don't delete root, but if we do...
      }

      deleteRecursively(id);

      return { nodes: newNodes, deletedNodes: newDeleted, modifiedNodes: newModified, rootId: id === state.rootId ? null : state.rootId };
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
            worldMatrix: currentWorldMatrix,
            isDirty: false
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
  },

  clearSaveDeltas: () => {
    set({ modifiedNodes: new Set(), deletedNodes: new Set() });
  }
}));
