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
  lastUpdated: string[];
  dirtyNodes: Set<string>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  bulkAddNodes: (nodes: (Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType })[]) => void;
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
  lastUpdated: [],
  dirtyNodes: new Set<string>(),

  addNode: (node) => {
    set((state) => {
      const newNode = getDefaultNode(node);
      const newNodes = state.nodes;
      newNodes[node.id] = newNode;

      if (node.parentId) {
        const parent = newNodes[node.parentId];
        if (parent) {
          newNodes[node.parentId] = {
            ...parent,
            children: [...parent.children, node.id]
          };
        }
      }

      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(node.id);

      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
        lastUpdated: [...state.lastUpdated, node.id],
        dirtyNodes
      };
    });
  },

  bulkAddNodes: (nodes) => {
    set((state) => {
      const newNodes = state.nodes;
      let newRootId = state.rootId;
      const childrenUpdates = new Map<string, string[]>();
      const newlyUpdated: string[] = [];
      const dirtyNodes = new Set(state.dirtyNodes);

      for (const node of nodes) {
        const newNode = getDefaultNode(node);
        newNodes[node.id] = newNode;
        newlyUpdated.push(node.id);
        dirtyNodes.add(node.id);

        if (node.parentId) {
          if (!childrenUpdates.has(node.parentId)) {
             const parent = newNodes[node.parentId] || state.nodes[node.parentId];
             childrenUpdates.set(node.parentId, parent ? [...parent.children] : []);
          }
          childrenUpdates.get(node.parentId)!.push(node.id);
        }
        
        if (!newRootId && node.parentId === null) {
          newRootId = node.id;
        }
      }

      for (const [parentId, newChildren] of childrenUpdates.entries()) {
        const parent = newNodes[parentId];
        if (parent) {
          newNodes[parentId] = {
            ...parent,
            children: newChildren
          };
        }
      }

      return {
        nodes: newNodes,
        rootId: newRootId,
        lastUpdated: newlyUpdated,
        dirtyNodes
      };
    });
  },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = state.nodes;
      newNodes[id] = { ...node, ...updates, isDirty: true };
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { nodes: newNodes, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
    });
  },

  reorderNode: (id, newParentId, index) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = state.nodes;

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

      newNodes[id] = { ...node, parentId: newParentId, isDirty: true };
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { nodes: newNodes, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
    });
  },

  markDirty: (id) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = state.nodes;
      newNodes[id] = { ...node, isDirty: true };
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { nodes: newNodes, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
    });
  },

  recalculateMatrices: () => {
    set((state) => {
      if (state.dirtyNodes.size === 0) return state;

      let newNodes = state.nodes;
      let hasChanges = false;
      const { rootId } = state;
      const newlyUpdated: string[] = [];

      if (!rootId || !state.nodes[rootId]) return state;

      // Build a set of nodes to traverse (ancestors of dirty nodes)
      const nodesToTraverse = new Set<string>();
      for (const id of state.dirtyNodes) {
          let currId: string | null = id;
          while (currId && !nodesToTraverse.has(currId)) {
             nodesToTraverse.add(currId);
             currId = state.nodes[currId]?.parentId || null;
          }
      }

      const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const node = newNodes[nodeId];
        if (!node) return;

        const isNowDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isNowDirty) {
          if (!hasChanges) {
             newNodes = state.nodes;
             hasChanges = true;
          }
          newlyUpdated.push(nodeId);
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

        const children = node.children;
        for (let i = 0; i < children.length; i++) {
          const childId = children[i];
          if (isNowDirty || nodesToTraverse.has(childId)) {
            traverse(childId, currentWorldMatrix, isNowDirty);
          }
        }
      };

      traverse(rootId, createMatrix(), false);

      return hasChanges ? { nodes: newNodes, lastUpdated: newlyUpdated, dirtyNodes: new Set() } : { ...state, dirtyNodes: new Set() };
    });
  }
}));
