import { generateKeyBetween, Matrix3, createMatrix, getTransformMatrix, multiplyMatrix, identityMatrix } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { syncMiddleware, SyncMessage } from './sync';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline' | 'image';

export const transientState: Record<string, any> = {};

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
  bufferOffset: number;
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
}

export const SPATIAL_X = 0;
export const SPATIAL_Y = 1;
export const SPATIAL_ROTATION = 2;
export const SPATIAL_SCALE_X = 3;
export const SPATIAL_SCALE_Y = 4;
export const SPATIAL_SKEW_X = 5;
export const SPATIAL_SKEW_Y = 6;
export const SPATIAL_OPACITY = 7;
export const LOCAL_MATRIX = 8; // 9 floats
export const WORLD_MATRIX = 17; // 9 floats
export const SPATIAL_IS_DIRTY = 26; // 1 float

export const NODE_DATA_SIZE = 27;
const MAX_NODES = 200000;

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  spatialBuffer: Float32Array;
  nodeOffsetMap: Record<string, number>;
  nextNodeOffset: number;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  version?: number;
  undo?: () => void;
  redo?: () => void;
  commitHistory?: () => void;

  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }) => void;
  addNodesBulk: (nodesArray: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }>) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>) => void;
  updateNodesBatch: (batchUpdates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => void;
}

const allocateNodeInBuffer = (
  node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>,
  buffer: Float32Array,
  offset: number
) => {
  buffer[offset + SPATIAL_X] = node.x ?? 0;
  buffer[offset + SPATIAL_Y] = node.y ?? 0;
  buffer[offset + SPATIAL_ROTATION] = node.rotation ?? 0;
  buffer[offset + SPATIAL_SCALE_X] = node.scaleX ?? 1;
  buffer[offset + SPATIAL_SCALE_Y] = node.scaleY ?? 1;
  buffer[offset + SPATIAL_SKEW_X] = node.skewX ?? 0;
  buffer[offset + SPATIAL_SKEW_Y] = node.skewY ?? 0;
  buffer[offset + SPATIAL_OPACITY] = node.opacity ?? 1;
  buffer[offset + SPATIAL_IS_DIRTY] = 1;

  const localMatrix = buffer.subarray(offset + LOCAL_MATRIX, offset + LOCAL_MATRIX + 9);
  const worldMatrix = buffer.subarray(offset + WORLD_MATRIX, offset + WORLD_MATRIX + 9);
  
  identityMatrix(localMatrix);
  identityMatrix(worldMatrix);

  return { localMatrix, worldMatrix };
};

const defineNodeProperties = (baseNode: any, buffer: Float32Array, offset: number) => {
  Object.defineProperties(baseNode, {
    x: { get: () => buffer[offset + SPATIAL_X], set: (v) => { buffer[offset + SPATIAL_X] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    y: { get: () => buffer[offset + SPATIAL_Y], set: (v) => { buffer[offset + SPATIAL_Y] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    rotation: { get: () => buffer[offset + SPATIAL_ROTATION], set: (v) => { buffer[offset + SPATIAL_ROTATION] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    scaleX: { get: () => buffer[offset + SPATIAL_SCALE_X], set: (v) => { buffer[offset + SPATIAL_SCALE_X] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    scaleY: { get: () => buffer[offset + SPATIAL_SCALE_Y], set: (v) => { buffer[offset + SPATIAL_SCALE_Y] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    skewX: { get: () => buffer[offset + SPATIAL_SKEW_X], set: (v) => { buffer[offset + SPATIAL_SKEW_X] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    skewY: { get: () => buffer[offset + SPATIAL_SKEW_Y], set: (v) => { buffer[offset + SPATIAL_SKEW_Y] = v; buffer[offset + SPATIAL_IS_DIRTY] = 1; }, enumerable: true },
    opacity: { get: () => buffer[offset + SPATIAL_OPACITY], set: (v) => { buffer[offset + SPATIAL_OPACITY] = v; }, enumerable: true },
    isDirty: { get: () => buffer[offset + SPATIAL_IS_DIRTY] === 1, set: (v) => { buffer[offset + SPATIAL_IS_DIRTY] = v ? 1 : 0; }, enumerable: true }
  });
};

const copyNodeWithBufferLink = (oldNode: SceneNode, updates: any, buffer: Float32Array): SceneNode => {
  const { localMatrix, worldMatrix, bufferOffset, ...rest } = oldNode;
  
  const nonSpatialRest: any = {};
  for (const key of Object.keys(rest)) {
    if (!['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity', 'isDirty'].includes(key)) {
      nonSpatialRest[key] = (rest as any)[key];
    }
  }

  const newNode: any = {
    ...nonSpatialRest,
    ...updates,
    localMatrix,
    worldMatrix,
    bufferOffset
  };

  defineNodeProperties(newNode, buffer, bufferOffset);
  
  if ('x' in updates) newNode.x = updates.x;
  if ('y' in updates) newNode.y = updates.y;
  if ('rotation' in updates) newNode.rotation = updates.rotation;
  if ('scaleX' in updates) newNode.scaleX = updates.scaleX;
  if ('scaleY' in updates) newNode.scaleY = updates.scaleY;
  if ('skewX' in updates) newNode.skewX = updates.skewX;
  if ('skewY' in updates) newNode.skewY = updates.skewY;
  if ('opacity' in updates) newNode.opacity = updates.opacity;
  if ('isDirty' in updates) newNode.isDirty = updates.isDirty;

  return newNode as SceneNode;
};

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  const buffer = new Float32Array(MAX_NODES * NODE_DATA_SIZE);

  const config = (set: any, get: any) => ({
    nodes: {},
    rootId: null,
    spatialBuffer: buffer,
    nodeOffsetMap: {},
    nextNodeOffset: 0,
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    remoteSelections: {},
    version: 0,
    commitHistory: () => {},
    undo: () => {},
    redo: () => {},

    setViewport: (viewport: any) => set({ viewport }),
    
    setSelectedNodeId: (selectedNodeId: any) => set({ selectedNodeId }),
    
    setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => set((state: any) => {
      const newRemoteSelections = { ...state.remoteSelections };
      if (nodeId === null) {
        delete newRemoteSelections[userId];
      } else {
        newRemoteSelections[userId] = { nodeId, color: color || '#ff0000', userName };
      }
      return { remoteSelections: newRemoteSelections };
    }),

    addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }) => {
      set((state: SceneGraphState) => {
        const offset = state.nextNodeOffset;
        const newNextOffset = offset + NODE_DATA_SIZE;
        
        const { localMatrix, worldMatrix } = allocateNodeInBuffer(node, state.spatialBuffer, offset);

        const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
        siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
        const lastSibling = siblings[siblings.length - 1];
        const order = node.order || generateKeyBetween(lastSibling?.order || null, null);

        const baseNode: any = {
          parentId: null,
          name: node.id,
          visible: true,
          locked: false,
          order,
          ...node,
          bufferOffset: offset,
          localMatrix,
          worldMatrix
        };

        delete baseNode.x; delete baseNode.y; delete baseNode.rotation; delete baseNode.scaleX; delete baseNode.scaleY; delete baseNode.skewX; delete baseNode.skewY; delete baseNode.opacity; delete baseNode.isDirty;

        defineNodeProperties(baseNode, state.spatialBuffer, offset);
        
        if (node.x !== undefined) baseNode.x = node.x;
        if (node.y !== undefined) baseNode.y = node.y;
        if (node.rotation !== undefined) baseNode.rotation = node.rotation;
        if (node.scaleX !== undefined) baseNode.scaleX = node.scaleX;
        if (node.scaleY !== undefined) baseNode.scaleY = node.scaleY;
        if (node.skewX !== undefined) baseNode.skewX = node.skewX;
        if (node.skewY !== undefined) baseNode.skewY = node.skewY;
        if (node.opacity !== undefined) baseNode.opacity = node.opacity;

        const newNode = baseNode as SceneNode;
        const newNodes = { ...state.nodes, [node.id]: newNode };
        const newNodeOffsetMap = { ...state.nodeOffsetMap, [node.id]: offset };

        return {
          nodes: newNodes,
          nodeOffsetMap: newNodeOffsetMap,
          nextNodeOffset: newNextOffset,
          rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
        };
      }, false, { type: 'addNode', payload: node });
    },

    addNodesBulk: (nodesArray: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }>) => {
      set((state: SceneGraphState) => {
        let offset = state.nextNodeOffset;
        const newNodes = { ...state.nodes };
        const newNodeOffsetMap = { ...state.nodeOffsetMap };
        let rootId = state.rootId;

        for (let i = 0; i < nodesArray.length; i++) {
          const node = nodesArray[i];
          const nodeOffset = offset;
          offset += NODE_DATA_SIZE;

          const { localMatrix, worldMatrix } = allocateNodeInBuffer(node, state.spatialBuffer, nodeOffset);

          const baseNode: any = {
            parentId: null,
            name: node.id,
            visible: true,
            locked: false,
            order: node.order || `${i}`,
            ...node,
            bufferOffset: nodeOffset,
            localMatrix,
            worldMatrix
          };

          delete baseNode.x; delete baseNode.y; delete baseNode.rotation; delete baseNode.scaleX; delete baseNode.scaleY; delete baseNode.skewX; delete baseNode.skewY; delete baseNode.opacity; delete baseNode.isDirty;

          defineNodeProperties(baseNode, state.spatialBuffer, nodeOffset);

          if (node.x !== undefined) baseNode.x = node.x;
          if (node.y !== undefined) baseNode.y = node.y;
          if (node.rotation !== undefined) baseNode.rotation = node.rotation;
          if (node.scaleX !== undefined) baseNode.scaleX = node.scaleX;
          if (node.scaleY !== undefined) baseNode.scaleY = node.scaleY;
          if (node.skewX !== undefined) baseNode.skewX = node.skewX;
          if (node.skewY !== undefined) baseNode.skewY = node.skewY;
          if (node.opacity !== undefined) baseNode.opacity = node.opacity;

          const newNode = baseNode as SceneNode;
          newNodes[node.id] = newNode;
          newNodeOffsetMap[node.id] = nodeOffset;

          if (!rootId && (node.parentId === null || node.parentId === undefined)) {
            rootId = node.id;
          }
        }

        return {
          nodes: newNodes,
          nodeOffsetMap: newNodeOffsetMap,
          nextNodeOffset: offset,
          rootId
        };
      });
    },

    updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        const newNode = copyNodeWithBufferLink(node, { ...updates, isDirty: true }, state.spatialBuffer);
        const newNodes = { ...state.nodes, [id]: newNode };

        return { nodes: newNodes };
      }, false, { type: 'updateNode', payload: { id, updates } });
    },

    updateNodesBatch: (batchUpdates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>>) => {
      set((state: SceneGraphState) => {
        const newNodes = { ...state.nodes };
        for (const [id, updates] of Object.entries(batchUpdates)) {
          const node = newNodes[id];
          if (node) {
            newNodes[id] = copyNodeWithBufferLink(node, { ...updates, isDirty: true }, state.spatialBuffer);
          }
        }
        return { nodes: newNodes };
      });
    },

    reorderNode: (id: string, newParentId: string | null, index: number) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === newParentId && n.id !== id);
        siblings.sort((a, b) => (a.order || '').localeCompare(b.order || ''));

        const prev = index > 0 ? siblings[index - 1] : null;
        const next = index < siblings.length ? siblings[index] : null;

        const newOrder = generateKeyBetween(prev?.order || null, next?.order || null);

        const newNode = copyNodeWithBufferLink(node, { parentId: newParentId, order: newOrder, isDirty: true }, state.spatialBuffer);

        return { nodes: { ...state.nodes, [id]: newNode } };
      }, false, { type: 'reorderNode', payload: { id, newParentId, index } });
    },

    markDirty: (id: string) => {
      set((state: SceneGraphState) => {
        const node = state.nodes[id];
        if (!node) return state;

        const newNode = copyNodeWithBufferLink(node, { isDirty: true }, state.spatialBuffer);
        return { nodes: { ...state.nodes, [id]: newNode } };
      });
    },

    recalculateMatrices: () => {
      const state = get();
      const buffer = state.spatialBuffer;
      const { rootId, nodes } = state;

      if (!rootId) return;

      const childrenMap: Record<string, string[]> = {};
      Object.values(nodes).forEach((n: any) => {
        const p = n.parentId || 'root';
        if (!childrenMap[p]) childrenMap[p] = [];
        childrenMap[p].push(n.id);
      });
      for (const k in childrenMap) {
        childrenMap[k].sort((a: any, b: any) => ((nodes as any)[a].order || '').localeCompare((nodes as any)[b].order || ''));
      }

      const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const node = nodes[nodeId];
        if (!node) return;

        const offset = node.bufferOffset;
        const isDirty = buffer[offset + SPATIAL_IS_DIRTY] === 1;
        const isNowDirty = isDirty || parentWasDirty;
        
        let currentWorldMatrix = parentWorldMatrix;

        if (isNowDirty) {
          getTransformMatrix(
            node.localMatrix,
            buffer[offset + SPATIAL_X],
            buffer[offset + SPATIAL_Y],
            buffer[offset + SPATIAL_ROTATION],
            buffer[offset + SPATIAL_SCALE_X],
            buffer[offset + SPATIAL_SCALE_Y],
            buffer[offset + SPATIAL_SKEW_X],
            buffer[offset + SPATIAL_SKEW_Y]
          );

          multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
          buffer[offset + SPATIAL_IS_DIRTY] = 0;
          currentWorldMatrix = node.worldMatrix;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        const children = childrenMap[nodeId] || [];
        for (let i = 0; i < children.length; i++) {
          traverse(children[i], currentWorldMatrix, isNowDirty);
        }
      };

      const rootWorldMatrix = createMatrix();
      traverse(rootId, rootWorldMatrix, false);
    }
  });

  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
