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
  changedNodes: Set<string>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  batchUpdateNodes: (updates: Map<string, Partial<SceneNode>>) => void;
  applyAnimationUpdates: (updates: Map<string, Partial<SceneNode>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: (mutateInPlace?: boolean) => void;
  clearChangedNodes: () => void;
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
  changedNodes: new Set(),

  addNode: (node) => {
    set((state) => {
      const newNode = getDefaultNode(node);
      const newNodes = { ...state.nodes, [node.id]: newNode };
      const newChangedNodes = new Set(state.changedNodes);
      newChangedNodes.add(node.id);

      if (node.parentId) {
        const parent = newNodes[node.parentId];
        if (parent) {
          newNodes[node.parentId] = {
            ...parent,
            children: [...parent.children, node.id]
          };
          newChangedNodes.add(node.parentId);
        }
      }

      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
        changedNodes: newChangedNodes
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
      const newChangedNodes = new Set(state.changedNodes);
      newChangedNodes.add(id);

      return { nodes: newNodes, changedNodes: newChangedNodes };
    });
  },

  batchUpdateNodes: (updates) => {
    set((state) => {
      const newChangedNodes = new Set(state.changedNodes);
      // In-place mutation for performance during playback
      for (const [id, nodeUpdates] of updates.entries()) {
        const node = state.nodes[id];
        if (node) {
          Object.assign(node, nodeUpdates);
          node.isDirty = true;
          newChangedNodes.add(id);
        }
      }
      return { 
        nodes: { ...state.nodes }, 
        changedNodes: newChangedNodes 
      };
    });
  },

  applyAnimationUpdates: (updates) => {
    set((state) => {
      const frameChangedNodes = new Set<string>();
      
      // 1. Mutate properties in-place
      for (const [id, nodeUpdates] of updates.entries()) {
        const node = state.nodes[id];
        if (node) {
          Object.assign(node, nodeUpdates);
          node.isDirty = true;
          frameChangedNodes.add(id);
        }
      }

      // 2. Recalculate matrices in-place without spreading new nodes during traversal
      const { rootId, nodes } = state;
      if (rootId && nodes[rootId]) {
        const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
          const node = nodes[nodeId];
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

            node.localMatrix = localMatrix;
            node.worldMatrix = currentWorldMatrix;
            node.isDirty = false;
            
            frameChangedNodes.add(nodeId);
          } else {
            currentWorldMatrix = node.worldMatrix;
          }

          for (const childId of node.children) {
            traverse(childId, currentWorldMatrix, isNowDirty);
          }
        };

        traverse(rootId, createMatrix(), false);
      }

      // 3. Perform a single dictionary spread to notify subscribers like the React UI
      //    This ensures standard handles update, but minimizes memory allocations.
      return {
        nodes: { ...nodes },
        changedNodes: frameChangedNodes
      };
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
      
      const newChangedNodes = new Set(state.changedNodes);
      newChangedNodes.add(id);
      if (node.parentId) newChangedNodes.add(node.parentId);
      if (newParentId) newChangedNodes.add(newParentId);

      return { nodes: newNodes, changedNodes: newChangedNodes };
    });
  },

  markDirty: (id) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      // O(1) dirty marking
      const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };
      
      const newChangedNodes = new Set(state.changedNodes);
      newChangedNodes.add(id);

      return { nodes: newNodes, changedNodes: newChangedNodes };
    });
  },

  clearChangedNodes: () => {
    set({ changedNodes: new Set() });
  },

  recalculateMatrices: (mutateInPlace = false) => {
    set((state) => {
      const newNodes = mutateInPlace ? state.nodes : { ...state.nodes };
      const { rootId } = state;
      const newChangedNodes = mutateInPlace ? state.changedNodes : new Set(state.changedNodes);

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

          if (mutateInPlace) {
            node.localMatrix = localMatrix;
            node.worldMatrix = currentWorldMatrix;
            node.isDirty = false;
          } else {
            newNodes[nodeId] = {
              ...node,
              localMatrix,
              worldMatrix: currentWorldMatrix,
              isDirty: false
            };
          }
          newChangedNodes.add(nodeId);
        } else {
            currentWorldMatrix = node.worldMatrix;
        }

        for (const childId of node.children) {
          traverse(childId, currentWorldMatrix, isNowDirty);
        }
      };

      traverse(rootId, createMatrix(), false);

      return mutateInPlace 
        ? { changedNodes: newChangedNodes } // already spread nodes in batchUpdateNodes, so we just return changedNodes
        : { nodes: newNodes, changedNodes: newChangedNodes };
    });
  }
}));
