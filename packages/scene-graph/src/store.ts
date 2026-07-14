import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';
import { syncMiddleware, SyncMessage } from './sync';

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
  bufferIndex: number;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  sharedBuffer: SharedArrayBuffer | ArrayBuffer;
  nextBufferIndex: number;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType }) => void;
  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType }>) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => void;
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

const getDefaultNode = (
  node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType },
  bufferIndex: number
): SceneNode => ({
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
  isDirty: true,
  bufferIndex
});

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  const initialBuffer = createBuffer();
  const sharedMatrices = new Float32Array(initialBuffer);
  let cachedChildrenMap: Record<string, string[]> | null = null;

  const config = (set: any, get: any) => ({
    nodes: {},
    rootId: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    remoteSelections: {},
    sharedBuffer: initialBuffer,
    nextBufferIndex: 0,

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

    addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType }) => {
      cachedChildrenMap = null;
      set((state: SceneGraphState) => {
        const bufferIndex = state.nextBufferIndex;
        const newNode = getDefaultNode(node, bufferIndex);
        
        const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
        siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
        const lastSibling = siblings[siblings.length - 1];
        newNode.order = generateKeyBetween(lastSibling?.order || null, null);
        
        const newNodes = { ...state.nodes, [node.id]: newNode };
        
        return {
          nodes: newNodes,
          rootId: state.rootId || (node.parentId === null ? node.id : state.rootId),
          nextBufferIndex: bufferIndex + 1
        };
      }, false, { type: 'addNode', payload: node });
    },

    addNodesBulk: (nodesToAdd: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>> & { id: string, type: NodeType }>) => {
      cachedChildrenMap = null;
      set((state: SceneGraphState) => {
        const newNodes = { ...state.nodes };
        let newRootId = state.rootId;
        let currentBufferIndex = state.nextBufferIndex;

        for (const node of nodesToAdd) {
          const newNode = getDefaultNode(node, currentBufferIndex++);
          newNodes[node.id] = newNode;

          if (node.parentId === null && !newRootId) {
            newRootId = node.id;
          }
        }

        return {
          nodes: newNodes,
          rootId: newRootId,
          nextBufferIndex: currentBufferIndex
        };
      });
    },

    updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferIndex'>>) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];
        const hasSpatialUpdate = Object.keys(updates).some(key => SPATIAL_PROPERTIES.includes(key));

        const isDirty = node.isDirty || hasSpatialUpdate;
        const newNodes = { ...state.nodes, [id]: { ...node, ...updates, isDirty } };

        return { nodes: newNodes };
      }, false, { type: 'updateNode', payload: { id, updates } });
    },

    reorderNode: (id: string, newParentId: string | null, index: number) => {
      cachedChildrenMap = null;
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

        return { nodes: newNodes };
      }, false, { type: 'reorderNode', payload: { id, newParentId, index } });
    },

    markDirty: (id: string) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };

        return { nodes: newNodes };
      });
    },

    recalculateMatrices: () => {
      set((state: SceneGraphState) => {
        const nodes = state.nodes;
        const { rootId } = state;
        if (!rootId || !nodes[rootId]) return state;

        if (!cachedChildrenMap) {
          cachedChildrenMap = {};
          for (const id in nodes) {
            const n = nodes[id];
            if (n.parentId) {
              if (!cachedChildrenMap[n.parentId]) cachedChildrenMap[n.parentId] = [];
              cachedChildrenMap[n.parentId].push(id);
            }
          }

          for (const k in cachedChildrenMap) {
            const list = cachedChildrenMap[k];
            if (list.length > 1) {
              list.sort((a: string, b: string) => {
                const oa = nodes[a].order || '';
                const ob = nodes[b].order || '';
                return oa < ob ? -1 : (oa > ob ? 1 : 0);
              });
            }
          }
        }

        const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
          const node = nodes[nodeId];
          if (!node) return;

          const isWorldDirty = node.isDirty || parentWasDirty;
          let currentWorldMatrix = parentWorldMatrix;
          let localMatrix = node.localMatrix;

          if (isWorldDirty) {
            if (node.isDirty) {
              localMatrix = getTransformMatrix(
                node.localMatrix,
                node.x, node.y, 
                node.rotation, 
                node.scaleX, node.scaleY,
                node.skewX || 0, node.skewY || 0
              );
            }
            currentWorldMatrix = multiplyMatrix(node.worldMatrix, parentWorldMatrix, localMatrix);

            node.localMatrix = localMatrix;
            node.worldMatrix = currentWorldMatrix;
            node.isDirty = false;
            
            if (node.bufferIndex !== undefined) {
              const offset = node.bufferIndex * FLOATS_PER_NODE;
              sharedMatrices[offset] = localMatrix[0];
              sharedMatrices[offset + 1] = localMatrix[1];
              sharedMatrices[offset + 2] = localMatrix[2];
              sharedMatrices[offset + 3] = localMatrix[3];
              sharedMatrices[offset + 4] = localMatrix[4];
              sharedMatrices[offset + 5] = localMatrix[5];
              sharedMatrices[offset + 6] = localMatrix[6];
              sharedMatrices[offset + 7] = localMatrix[7];
              sharedMatrices[offset + 8] = localMatrix[8];

              sharedMatrices[offset + 9] = currentWorldMatrix[0];
              sharedMatrices[offset + 10] = currentWorldMatrix[1];
              sharedMatrices[offset + 11] = currentWorldMatrix[2];
              sharedMatrices[offset + 12] = currentWorldMatrix[3];
              sharedMatrices[offset + 13] = currentWorldMatrix[4];
              sharedMatrices[offset + 14] = currentWorldMatrix[5];
              sharedMatrices[offset + 15] = currentWorldMatrix[6];
              sharedMatrices[offset + 16] = currentWorldMatrix[7];
              sharedMatrices[offset + 17] = currentWorldMatrix[8];
            }
          } else {
            currentWorldMatrix = node.worldMatrix;
          }

          const children = cachedChildrenMap![nodeId];
          if (children) {
            for (let i = 0; i < children.length; i++) {
              traverse(children[i], currentWorldMatrix, isWorldDirty);
            }
          }
        };

        traverse(rootId, createMatrix(), false);

        return { nodes };
      });
    }
  });

  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
