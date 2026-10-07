import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline' | 'image';

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

  // Internal state
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  childrenMap?: Record<string, SceneNode[]>;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => void;
}

const getDefaultNode = (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }): SceneNode => ({
  parentId: null,
  
  name: node.id,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  visible: true,
  locked: false,
  order: '',
  ...node,
  localMatrix: createMatrix(),
  worldMatrix: createMatrix(),
  isDirty: true
});

import { syncMiddleware, SyncMessage } from './sync';

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  const config = (set: any, get: any) => ({
  nodes: {},
  rootId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  remoteSelections: {},

  setViewport: (viewport: { x: number; y: number; zoom: number }) => set({ viewport }),
  
  setSelectedNodeId: (selectedNodeId: string | null) => set({ selectedNodeId }),
  
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => set((state: SceneGraphState) => {
    const newRemoteSelections = { ...state.remoteSelections };
    if (nodeId === null) {
      delete newRemoteSelections[userId];
    } else {
      newRemoteSelections[userId] = { nodeId, color: color || '#ff0000', userName };
    }
    return { remoteSelections: newRemoteSelections };
  }),

  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => {
    set((state: SceneGraphState) => {
      const newNode = getDefaultNode(node);
      
      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
      siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
      const lastSibling = siblings[siblings.length - 1];
      newNode.order = generateKeyBetween(lastSibling?.order || null, null);
      
      const newNodes = { ...state.nodes, [node.id]: newNode };
      const childrenMap: Record<string, SceneNode[]> = state.childrenMap ? { ...state.childrenMap } : {};
      if (node.parentId) {
        const list = childrenMap[node.parentId] ? [...childrenMap[node.parentId]] : [];
        list.push(newNode);
        list.sort((a, b) => {
          const orderA = a.order || '';
          const orderB = b.order || '';
          return orderA < orderB ? -1 : (orderA > orderB ? 1 : 0);
        });
        childrenMap[node.parentId] = list;
      }
      
      return {
        nodes: newNodes,
        childrenMap,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
      };
    }, false, { type: 'addNode', payload: node });
  },

  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      const childrenMap: Record<string, SceneNode[]> = state.childrenMap ? { ...state.childrenMap } : {};
      let rootId = state.rootId;
      for (const node of nodes) {
        const newNode = getDefaultNode(node);
        newNodes[node.id] = newNode;
        if (!rootId && node.parentId === null) {
          rootId = node.id;
        }
        if (node.parentId) {
          if (!childrenMap[node.parentId]) childrenMap[node.parentId] = [];
          childrenMap[node.parentId].push(newNode);
        }
      }
      for (const k in childrenMap) {
        const list = childrenMap[k];
        if (list.length > 1) {
          list.sort((a, b) => {
            const orderA = a.order || '';
            const orderB = b.order || '';
            return orderA < orderB ? -1 : (orderA > orderB ? 1 : 0);
          });
        }
      }
      return { nodes: newNodes, rootId, childrenMap };
    });
  },

  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];
      const hasSpatialUpdate = Object.keys(updates).some(key => SPATIAL_PROPERTIES.includes(key));

      // O(1) dirty marking: just mark the current node if spatial properties changed.
      // The recalculate step will propagate this to children automatically!
      const isDirty = node.isDirty || hasSpatialUpdate;
      const newNodes = { ...state.nodes, [id]: { ...node, ...updates, isDirty } };

      return { nodes: newNodes };
    }, false, { type: 'updateNode', payload: { id, updates } });
  },

  reorderNode: (id: string, newParentId: string | null, index: number) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };

      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === newParentId && n.id !== id);
      siblings.sort((a, b) => (a.order || '').localeCompare(b.order || ''));

      const prev = index > 0 ? siblings[index - 1] : null;
      const next = index < siblings.length ? siblings[index] : null;

      const newOrder = generateKeyBetween(prev?.order || null, next?.order || null);

      newNodes[id] = { ...node, parentId: newParentId, order: newOrder, isDirty: true };

      return { nodes: newNodes, childrenMap: undefined };
    }, false, { type: 'reorderNode', payload: { id, newParentId, index } });
  },

  markDirty: (id: string) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      // O(1) dirty marking
      const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };

      return { nodes: newNodes };
    });
  },

  recalculateMatrices: () => {
    set((state: SceneGraphState) => {
      const newNodes = state.nodes;
      const { rootId } = state;
      let childrenMap = state.childrenMap;
      
      if (!childrenMap) {
        childrenMap = {};
        for (const id in newNodes) {
          const n = newNodes[id];
          const p = n.parentId;
          if (p) {
            let list = childrenMap[p];
            if (!list) {
              list = [];
              childrenMap[p] = list;
            }
            list.push(n);
          }
        }

        for (const k in childrenMap) {
          const list = childrenMap[k];
          if (list.length > 1) {
            list.sort((a, b) => {
              const orderA = a.order || '';
              const orderB = b.order || '';
              return orderA < orderB ? -1 : (orderA > orderB ? 1 : 0);
            });
          }
        }
      }

      if (!rootId || !newNodes[rootId]) return state;

      const traverse = (node: SceneNode, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const isWorldDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isWorldDirty) {
          let localMatrix = node.localMatrix;
          if (!localMatrix) {
            localMatrix = createMatrix();
            node.localMatrix = localMatrix;
          }

          if (node.isDirty) {
            getTransformMatrix(
              localMatrix,
              node.x, node.y, 
              node.rotation, 
              node.scaleX, node.scaleY,
              node.skewX || 0, node.skewY || 0
            );
          }

          let worldMatrix = node.worldMatrix;
          if (!worldMatrix) {
            worldMatrix = createMatrix();
            node.worldMatrix = worldMatrix;
          }

          multiplyMatrix(worldMatrix, parentWorldMatrix, localMatrix);
          currentWorldMatrix = worldMatrix;
          node.isDirty = false;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        const children = childrenMap[node.id];
        if (children) {
          for (let i = 0; i < children.length; i++) {
            traverse(children[i], currentWorldMatrix, isWorldDirty);
          }
        }
      };

      traverse(newNodes[rootId], createMatrix(), false);

      return { nodes: newNodes, childrenMap };
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
