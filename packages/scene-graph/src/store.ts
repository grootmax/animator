import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';

const IDENTITY_MATRIX: Matrix3 = createMatrix();

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
  childrenMap?: Record<string, string[]> | null;
  rootId: string | null;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  lastUpdated: string[];
  dirtyNodes: Set<string>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  bulkAddNodes: (nodes: (Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType })[]) => void;
  addNodesBulk: (nodes: (Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType })[]) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  updateNodesBatch: (updates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>>) => void;
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
        childrenMap: null,
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
        childrenMap: null,
        rootId: newRootId,
        lastUpdated: newlyUpdated,
        dirtyNodes
      };
    }, false, { type: 'bulkAddNodes', payload: nodes });
  },

  addNodesBulk: (nodes: (Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType })[]) => {
    get().bulkAddNodes(nodes);
  },

  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];
      const hasSpatialUpdate = Object.keys(updates).some(key => SPATIAL_PROPERTIES.includes(key));

      const isDirty = node.isDirty || hasSpatialUpdate;
      state.nodes[id] = { ...node, ...updates, isDirty };
      const dirtyNodes = new Set(state.dirtyNodes);
      dirtyNodes.add(id);

      return { lastUpdated: [id], dirtyNodes };
    }, false, { type: 'updateNode', payload: { id, updates } });
  },

  updateNodesBatch: (updates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>>) => {
    set((state: SceneGraphState) => {
      const newlyUpdated: string[] = [];
      const dirtyNodes = new Set(state.dirtyNodes);
      const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];

      for (const [id, nodeUpdates] of Object.entries(updates)) {
        const node = state.nodes[id];
        if (!node) continue;
        const hasSpatialUpdate = Object.keys(nodeUpdates).some(key => SPATIAL_PROPERTIES.includes(key));
        const isDirty = node.isDirty || hasSpatialUpdate;
        state.nodes[id] = { ...node, ...nodeUpdates, isDirty };
        newlyUpdated.push(id);
        dirtyNodes.add(id);
      }

      return { lastUpdated: newlyUpdated, dirtyNodes };
    }, false, { type: 'updateNodesBatch', payload: updates });
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

      return { nodes: newNodes, childrenMap: null, lastUpdated: [...state.lastUpdated, id], dirtyNodes };
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

      const { rootId, nodes } = state;
      if (!rootId || !nodes[rootId]) return state;

      let childrenMap = state.childrenMap;
      if (!childrenMap) {
        childrenMap = {};
        for (const id in nodes) {
          const p = nodes[id].parentId;
          if (p !== null && p !== undefined) {
            if (!childrenMap[p]) childrenMap[p] = [id];
            else childrenMap[p].push(id);
          }
        }
        for (const k in childrenMap) {
          const arr = childrenMap[k];
          if (arr.length > 1) {
            arr.sort((a, b) => {
              const oa = nodes[a]?.order || '';
              const ob = nodes[b]?.order || '';
              return oa < ob ? -1 : oa > ob ? 1 : 0;
            });
          }
        }
      }

      const nodesToTraverse = new Set<string>();
      for (const id of state.dirtyNodes) {
        let currId: string | null = id;
        while (currId && !nodesToTraverse.has(currId)) {
          nodesToTraverse.add(currId);
          currId = nodes[currId]?.parentId || null;
        }
      }

      const newlyUpdated: string[] = [];
      const updatedDirtySet = new Set<string>();
      const stack: string[] = [rootId];
      let hasChanges = false;

      while (stack.length > 0) {
        const nodeId = stack.pop()!;
        const node = nodes[nodeId];
        if (!node) continue;

        const parentId = node.parentId;
        const parentWasDirty = parentId ? updatedDirtySet.has(parentId) : false;
        const isWorldDirty = node.isDirty || parentWasDirty;

        if (isWorldDirty) {
          hasChanges = true;
          newlyUpdated.push(nodeId);
          updatedDirtySet.add(nodeId);

          if (node.isDirty) {
            getTransformMatrix(
              node.localMatrix,
              node.x, node.y,
              node.rotation,
              node.scaleX, node.scaleY,
              node.skewX || 0, node.skewY || 0
            );
            node.isDirty = false;
          }

          const parentWorldMatrix = (parentId && nodes[parentId]) ? nodes[parentId].worldMatrix : IDENTITY_MATRIX;
          multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
        }

        const children = childrenMap[nodeId];
        if (children) {
          if (isWorldDirty) {
            for (let i = children.length - 1; i >= 0; i--) {
              stack.push(children[i]);
            }
          } else if (children.length > nodesToTraverse.size) {
            for (const tId of nodesToTraverse) {
              if (nodes[tId]?.parentId === nodeId) {
                stack.push(tId);
              }
            }
          } else {
            for (let i = children.length - 1; i >= 0; i--) {
              const childId = children[i];
              if (nodesToTraverse.has(childId)) {
                stack.push(childId);
              }
            }
          }
        }
      }

      return hasChanges
        ? { childrenMap, lastUpdated: newlyUpdated, dirtyNodes: new Set() }
        : { ...state, childrenMap, dirtyNodes: new Set() };
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
