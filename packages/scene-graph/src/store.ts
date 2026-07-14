import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix, identityMatrix } from '@monorepo/math';
import { syncMiddleware, SyncMessage } from './sync';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline' | 'image';

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  children: string[];
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
  lastUpdate?: number;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  updateNodeInPlace: (id: string, key: string, value: any) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => void;
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
  order: '',
  ...node,
  localMatrix: createMatrix(),
  worldMatrix: createMatrix(),
  isDirty: true
});

const TEMP_ROOT_MATRIX = createMatrix();

const traverseNodes = (nodes: Record<string, SceneNode>, nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
  const node = nodes[nodeId];
  if (!node) return;

  const isNowDirty = node.isDirty || parentWasDirty;
  let currentWorldMatrix = parentWorldMatrix;

  if (isNowDirty) {
    getTransformMatrix(
      node.localMatrix,
      node.x, node.y, 
      node.rotation, 
      node.scaleX, node.scaleY,
      node.skewX || 0, node.skewY || 0
    );
    multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
    currentWorldMatrix = node.worldMatrix;
  } else {
    currentWorldMatrix = node.worldMatrix;
  }

  const children = node.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      traverseNodes(nodes, children[i], currentWorldMatrix, isNowDirty);
    }
  }
};

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  const config = (set: any, get: any) => ({
    nodes: {},
    rootId: null,
    lastUpdate: 0,
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
        newNode.children = newNode.children || [];
        
        const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
        siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
        const lastSibling = siblings[siblings.length - 1];
        newNode.order = generateKeyBetween(lastSibling?.order || null, null);
        
        const newNodes = { ...state.nodes, [node.id]: newNode };

        if (node.parentId && newNodes[node.parentId]) {
          const parent = newNodes[node.parentId];
          if (!parent.children.includes(node.id)) {
            parent.children = [...parent.children, node.id];
          }
        }
        
        return {
          nodes: newNodes,
          rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
        };
      }, false, { type: 'addNode', payload: node });
    },

    addNodesBulk: (nodesToAdd: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
      set((state: SceneGraphState) => {
        const newNodes = { ...state.nodes };
        let newRootId = state.rootId;

        for (const node of nodesToAdd) {
          const newNode = getDefaultNode(node);
          newNode.children = newNode.children || [];
          newNodes[node.id] = newNode;

          if (node.parentId === null && !newRootId) {
            newRootId = node.id;
          }
          if (node.parentId && newNodes[node.parentId]) {
            newNodes[node.parentId].children.push(node.id);
          }
        }

        return {
          nodes: newNodes,
          rootId: newRootId,
          lastUpdate: performance.now()
        };
      });
    },

    updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        Object.assign(node, updates);
        node.isDirty = true;

        return { lastUpdate: performance.now() };
      }, false, { type: 'updateNode', payload: { id, updates } });
    },

    updateNodeInPlace: (id: string, key: string, value: any) => {
      const node = get().nodes[id];
      if (!node) return;
      (node as any)[key] = value;
      node.isDirty = true;
    },

    reorderNode: (id: string, newParentId: string | null, index: number) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        const newNodes = { ...state.nodes };

        if (node.parentId && newNodes[node.parentId]) {
          const parent = newNodes[node.parentId];
          parent.children = parent.children.filter(childId => childId !== id);
        }

        if (newParentId && newNodes[newParentId]) {
          const newParent = newNodes[newParentId];
          const newChildren = [...newParent.children];
          newChildren.splice(index, 0, id);
          newParent.children = newChildren;
        }

        const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === newParentId && n.id !== id);
        siblings.sort((a, b) => (a.order || '').localeCompare(b.order || ''));

        const prev = index > 0 ? siblings[index - 1] : null;
        const next = index < siblings.length ? siblings[index] : null;

        const newOrder = generateKeyBetween(prev?.order || null, next?.order || null);

        node.parentId = newParentId;
        node.order = newOrder;
        node.isDirty = true;

        return { nodes: newNodes, lastUpdate: performance.now() };
      }, false, { type: 'reorderNode', payload: { id, newParentId, index } });
    },

    markDirty: (id: string) => {
      const node = get().nodes[id];
      if (!node) return;
      node.isDirty = true;
      set({ lastUpdate: performance.now() });
    },

    recalculateMatrices: () => {
      const state = get();
      const { nodes, rootId } = state;

      if (!rootId || !nodes[rootId]) return;

      identityMatrix(TEMP_ROOT_MATRIX);
      traverseNodes(nodes, rootId, TEMP_ROOT_MATRIX, false);

      set({ lastUpdate: performance.now() });
    }
  });

  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
