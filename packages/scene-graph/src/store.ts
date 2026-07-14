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
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  lastUpdated: string[];
  dirtyNodes: Set<string>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  bulkAddNodes: (nodes: (Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType })[]) => void;
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
  lastUpdated: [],
  dirtyNodes: new Set<string>(),

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
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(node.id);

      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
        lastUpdated: [...state.lastUpdated, node.id],
        dirtyNodes
      };
    }, false, { type: 'addNode', payload: node });
  },

  bulkAddNodes: (nodes: (Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType })[]) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      let newRootId = state.rootId;
      const newlyUpdated: string[] = [];
      const dirtyNodes = new Set(state.dirtyNodes);

      const parentLastOrders = new Map<string | null, string | null>();
      for (const n of Object.values(state.nodes)) {
        const p = n.parentId || null;
        if (!parentLastOrders.has(p) || (n.order || '') > (parentLastOrders.get(p) || '')) {
          parentLastOrders.set(p, n.order || null);
        }
      }

      for (const node of nodes) {
        const newNode = getDefaultNode(node);
        const parentKey = node.parentId || null;
        const lastOrder = parentLastOrders.get(parentKey) || null;
        const nextOrder = generateKeyBetween(lastOrder, null);
        newNode.order = nextOrder;
        parentLastOrders.set(parentKey, nextOrder);

        newNodes[node.id] = newNode;
        newlyUpdated.push(node.id);
        dirtyNodes.add(node.id);
        
        if (!newRootId && node.parentId === null) {
          newRootId = node.id;
        }
      }

      return {
        nodes: newNodes,
        rootId: newRootId,
        lastUpdated: newlyUpdated,
        dirtyNodes
      };
    }, false, { type: 'bulkAddNodes', payload: nodes });
  },

  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];
      const hasSpatialUpdate = Object.keys(updates).some(key => SPATIAL_PROPERTIES.includes(key));

      const isDirty = node.isDirty || hasSpatialUpdate;
      const newNodes = { ...state.nodes, [id]: { ...node, ...updates, isDirty } };
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { nodes: newNodes, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
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
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { nodes: newNodes, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
    }, false, { type: 'reorderNode', payload: { id, newParentId, index } });
  },

  markDirty: (id: string) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { nodes: newNodes, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
    });
  },

  recalculateMatrices: () => {
    set((state: SceneGraphState) => {
      if (state.dirtyNodes.size === 0) return state;

      let newNodes = state.nodes;
      let hasChanges = false;
      const { rootId } = state;
      const newlyUpdated: string[] = [];

      if (!rootId || !state.nodes[rootId]) return state;

      const childrenMap: Record<string, string[]> = {};
      Object.values(state.nodes).forEach((n: any) => {
        const p = n.parentId || 'root';
        if (!childrenMap[p]) childrenMap[p] = [];
        childrenMap[p].push(n.id);
      });
      for (const k in childrenMap) {
        childrenMap[k].sort((a: any, b: any) => ((state.nodes as any)[a].order || '').localeCompare((state.nodes as any)[b].order || ''));
      }

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

        const isWorldDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isWorldDirty) {
          if (!hasChanges) {
            newNodes = { ...state.nodes };
            hasChanges = true;
          }
          newlyUpdated.push(nodeId);
          let localMatrix = node.localMatrix;

          if (node.isDirty) {
            localMatrix = getTransformMatrix(
              node.x, node.y, 
              node.rotation, 
              node.scaleX, node.scaleY,
              node.skewX || 0, node.skewY || 0
            );
          }
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

        const children = childrenMap[nodeId] || [];
        for (let i = 0; i < children.length; i++) {
          const childId = children[i];
          if (isWorldDirty || nodesToTraverse.has(childId)) {
            traverse(childId, currentWorldMatrix, isWorldDirty);
          }
        }
      };

      traverse(rootId, createMatrix(), false);

      return hasChanges
        ? { nodes: newNodes, lastUpdated: newlyUpdated, dirtyNodes: new Set() }
        : { ...state, dirtyNodes: new Set() };
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
