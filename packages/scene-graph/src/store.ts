import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix, identityMatrix } from '@monorepo/math';

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

  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
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
  // Create a new object with prototype null to avoid copying getters as values if we used spread
  // Wait, spread operator copies enumerables, so it evaluates getters.
  // To keep the getters working, we must recreate the object and re-apply defineProperties.
  const { localMatrix, worldMatrix, bufferOffset, ...rest } = oldNode;
  
  // Extract only the fields that are NOT part of the getters
  const nonSpatialRest: any = {};
  for (const key of Object.keys(rest)) {
    if (!['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity', 'isDirty'].includes(key)) {
      nonSpatialRest[key] = (rest as any)[key];
    }
  }

  const newNode: any = {
    ...nonSpatialRest,
    ...updates, // Only update non-spatial or spatial via setter later
    localMatrix,
    worldMatrix,
    bufferOffset
  };

  defineNodeProperties(newNode, buffer, bufferOffset);
  
  // If updates contained spatial properties, apply them through the newly created setters
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

export const createSceneGraphStore = () => {
  const buffer = new Float32Array(MAX_NODES * NODE_DATA_SIZE);

  return createStore<SceneGraphState>((set, get) => ({
    nodes: {},
    rootId: null,
    spatialBuffer: buffer,
    nodeOffsetMap: {},
    nextNodeOffset: 0,

    addNode: (node) => {
      set((state) => {
        const offset = state.nextNodeOffset;
        const newNextOffset = offset + NODE_DATA_SIZE;
        
        const { localMatrix, worldMatrix } = allocateNodeInBuffer(node, state.spatialBuffer, offset);

        const baseNode: any = {
          parentId: null,
          children: [],
          name: node.id,
          visible: true,
          locked: false,
          ...node, // This might overwrite some fields, but we will redefine properties
          bufferOffset: offset,
          localMatrix,
          worldMatrix
        };

        // Remove spatial properties from baseNode so defineProperties doesn't fail or get overridden
        delete baseNode.x; delete baseNode.y; delete baseNode.rotation; delete baseNode.scaleX; delete baseNode.scaleY; delete baseNode.skewX; delete baseNode.skewY; delete baseNode.opacity; delete baseNode.isDirty;

        defineNodeProperties(baseNode, state.spatialBuffer, offset);
        
        // Ensure values are set
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

        if (node.parentId) {
          const parent = newNodes[node.parentId];
          if (parent) {
            newNodes[node.parentId] = copyNodeWithBufferLink(parent, {
              children: [...parent.children, node.id]
            }, state.spatialBuffer);
          }
        }

        return {
          nodes: newNodes,
          nodeOffsetMap: newNodeOffsetMap,
          nextNodeOffset: newNextOffset,
          rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
        };
      });
    },

    updateNode: (id, updates) => {
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;

        // Is it only spatial properties?
        // We can optimize if it's only spatial, but Zustand requires new object references to trigger renders.
        // For zero-allocation, animation engine bypasses this completely! This is only used for UI updates now.
        const newNode = copyNodeWithBufferLink(node, { ...updates, isDirty: true }, state.spatialBuffer);
        const newNodes = { ...state.nodes, [id]: newNode };

        return { nodes: newNodes };
      });
    },

    reorderNode: (id, newParentId, index) => {
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;

        const newNodes = { ...state.nodes };

        if (node.parentId && newNodes[node.parentId]) {
          const parent = newNodes[node.parentId];
          newNodes[node.parentId] = copyNodeWithBufferLink(parent, {
            children: parent.children.filter(childId => childId !== id)
          }, state.spatialBuffer);
        }

        if (newParentId && newNodes[newParentId]) {
          const newParent = newNodes[newParentId];
          const newChildren = [...newParent.children];
          newChildren.splice(index, 0, id);
          newNodes[newParentId] = copyNodeWithBufferLink(newParent, {
            children: newChildren
          }, state.spatialBuffer);
        }

        newNodes[id] = copyNodeWithBufferLink(node, { parentId: newParentId, isDirty: true }, state.spatialBuffer);

        return { nodes: newNodes };
      });
    },

    markDirty: (id) => {
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;

        const newNode = copyNodeWithBufferLink(node, { isDirty: true }, state.spatialBuffer);
        return { nodes: { ...state.nodes, [id]: newNode } };
      });
    },

    recalculateMatrices: () => {
      // Zero allocation matrix recalculation
      const state = get();
      const buffer = state.spatialBuffer;
      const { rootId, nodes } = state;

      if (!rootId) return;

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
          buffer[offset + SPATIAL_IS_DIRTY] = 0; // clear dirty
          currentWorldMatrix = node.worldMatrix;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        const children = node.children;
        for (let i = 0; i < children.length; i++) {
          traverse(children[i], currentWorldMatrix, isNowDirty);
        }
      };

      const rootWorldMatrix = createMatrix();
      traverse(rootId, rootWorldMatrix, false);
      
      // We don't call set() here because we updated the buffers in-place!
      // This is the core of the zero-allocation approach.
    }
  }));
};
