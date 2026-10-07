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
  childrenMap: Record<string, string[]>;
  rootId: string | null;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  updateNodesBatch: (batchUpdates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>>) => void;
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

const IDENTITY_MATRIX: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  const config = (set: any, get: any) => ({
  nodes: {},
  childrenMap: {},
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
      const parentId = node.parentId || null;
      
      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === parentId);
      siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
      const lastSibling = siblings[siblings.length - 1];
      newNode.order = generateKeyBetween(lastSibling?.order || null, null);
      
      const newNodes = { ...state.nodes, [node.id]: newNode };
      const newChildrenMap = { ...state.childrenMap };
      if (parentId) {
        newChildrenMap[parentId] = [...(newChildrenMap[parentId] || []), node.id];
      }
      
      return {
        nodes: newNodes,
        childrenMap: newChildrenMap,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
      };
    }, false, { type: 'addNode', payload: node });
  },

  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      const newChildrenMap = { ...state.childrenMap };
      let rootId = state.rootId;
      for (const node of nodes) {
        const newNode = getDefaultNode(node);
        newNodes[node.id] = newNode;
        if (!rootId && node.parentId === null) {
          rootId = node.id;
        }
        if (node.parentId) {
          if (!newChildrenMap[node.parentId]) newChildrenMap[node.parentId] = [node.id];
          else newChildrenMap[node.parentId].push(node.id);
        }
      }
      return { nodes: newNodes, childrenMap: newChildrenMap, rootId };
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

  updateNodesBatch: (batchUpdates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>>) => {
    set((state: SceneGraphState) => {
      const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];
      const newNodes = { ...state.nodes };
      for (const id in batchUpdates) {
        const node = newNodes[id];
        if (!node) continue;
        const updates = batchUpdates[id];
        const hasSpatialUpdate = Object.keys(updates).some(key => SPATIAL_PROPERTIES.includes(key));
        const isDirty = node.isDirty || hasSpatialUpdate;
        newNodes[id] = { ...node, ...updates, isDirty };
      }
      return { nodes: newNodes };
    });
  },

  reorderNode: (id: string, newParentId: string | null, index: number) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };
      const oldParentId = node.parentId;

      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === newParentId && n.id !== id);
      siblings.sort((a, b) => (a.order || '').localeCompare(b.order || ''));

      const prev = index > 0 ? siblings[index - 1] : null;
      const next = index < siblings.length ? siblings[index] : null;

      const newOrder = generateKeyBetween(prev?.order || null, next?.order || null);

      newNodes[id] = { ...node, parentId: newParentId, order: newOrder, isDirty: true };

      const newChildrenMap = { ...state.childrenMap };
      if (oldParentId && newChildrenMap[oldParentId]) {
        newChildrenMap[oldParentId] = newChildrenMap[oldParentId].filter(childId => childId !== id);
      }
      if (newParentId) {
        const list = (newChildrenMap[newParentId] || []).filter(childId => childId !== id);
        list.splice(index, 0, id);
        newChildrenMap[newParentId] = list;
      }

      return { nodes: newNodes, childrenMap: newChildrenMap };
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
      const nodes = state.nodes;
      const { rootId } = state;

      if (!rootId || !nodes[rootId]) return state;

      let childrenMap = state.childrenMap;
      if (!childrenMap || Object.keys(childrenMap).length === 0) {
        const cmap: Record<string, string[]> = {};
        const nodeKeys = Object.keys(nodes);
        for (let i = 0; i < nodeKeys.length; i++) {
          const id = nodeKeys[i];
          const p = nodes[id].parentId;
          if (p) {
            if (!cmap[p]) cmap[p] = [id];
            else cmap[p].push(id);
          }
        }
        childrenMap = cmap;
      }

      const queueIds: string[] = [rootId];
      const queueParentDirty: boolean[] = [false];
      let head = 0;

      while (head < queueIds.length) {
        const nodeId = queueIds[head];
        const parentWasDirty = queueParentDirty[head++];
        const node = nodes[nodeId];
        if (!node) continue;

        const isWorldDirty = node.isDirty || parentWasDirty;

        if (isWorldDirty) {
          if (!node.localMatrix) node.localMatrix = createMatrix();
          if (!node.worldMatrix) node.worldMatrix = createMatrix();

          if (node.isDirty) {
            getTransformMatrix(
              node.localMatrix,
              node.x,
              node.y,
              node.rotation,
              node.scaleX,
              node.scaleY,
              node.skewX || 0,
              node.skewY || 0
            );
          }

          const parentWorldMatrix = node.parentId && nodes[node.parentId]
            ? nodes[node.parentId].worldMatrix
            : IDENTITY_MATRIX;

          multiplyMatrix(
            node.worldMatrix,
            parentWorldMatrix,
            node.localMatrix
          );

          node.isDirty = false;
        }

        const children = childrenMap[nodeId];
        if (children) {
          for (let i = 0; i < children.length; i++) {
            queueIds.push(children[i]);
            queueParentDirty.push(isWorldDirty);
          }
        }
      }

      return { nodes: state.nodes };
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
