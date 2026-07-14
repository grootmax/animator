import { createStore } from 'zustand/vanilla';
import { Matrix3 } from '@monorepo/math';
import { workerCode } from './worker';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline';

export const MAX_NODES = 150000;
export const STRIDE = 32;

export const OFF_X = 0;
export const OFF_Y = 1;
export const OFF_ROT = 2;
export const OFF_SX = 3;
export const OFF_SY = 4;
export const OFF_SKX = 5;
export const OFF_SKY = 6;
export const OFF_OPACITY = 7;
export const OFF_LM_START = 8;
export const OFF_WM_START = 17;

export const OFF_PARENT = 26;
export const OFF_FIRST_CHILD = 27;
export const OFF_NEXT_SIBLING = 28;
export const OFF_FLAGS = 29;

export const sab = new SharedArrayBuffer(MAX_NODES * STRIDE * 4);
export const f32 = new Float32Array(sab);
export const i32 = new Int32Array(sab);

for (let i = 0; i < MAX_NODES; i++) {
  const idx = i * STRIDE;
  i32[idx + OFF_PARENT] = -1;
  i32[idx + OFF_FIRST_CHILD] = -1;
  i32[idx + OFF_NEXT_SIBLING] = -1;
  i32[idx + OFF_FLAGS] = 3;
  f32[idx + OFF_SX] = 1;
  f32[idx + OFF_SY] = 1;
  f32[idx + OFF_OPACITY] = 1;
}

let worker: Worker | null = null;
if (typeof Worker !== 'undefined') {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  worker = new Worker(URL.createObjectURL(blob));
  worker.postMessage({ type: 'INIT', sab });
}

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
  bufferIndex: number;
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
  isDirty: boolean;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  idToIndex: Map<string, number>;
  nextBufferIndex: number;
  addNode: (node: Partial<SceneNode> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
}

const updateBufferFlags = (idx: number, isDirty?: boolean, visible?: boolean) => {
  let flags = i32[idx + OFF_FLAGS];
  if (isDirty !== undefined) {
    if (isDirty) flags |= 1; else flags &= ~1;
  }
  if (visible !== undefined) {
    if (visible) flags |= 2; else flags &= ~2;
  }
  i32[idx + OFF_FLAGS] = flags;
};

export const createSceneGraphStore = () => createStore<SceneGraphState>((set, get) => ({
  nodes: {},
  rootId: null,
  idToIndex: new Map(),
  nextBufferIndex: 0,

  addNode: (node) => {
    set((state) => {
      const idx = state.nextBufferIndex;
      const idxOffset = idx * STRIDE;
      const idToIndex = new Map(state.idToIndex);
      idToIndex.set(node.id, idx);

      const newNode: any = {
        name: node.id,
        locked: false,
        ...node,
        parentId: node.parentId || null,
        children: [],
        bufferIndex: idx
      };

      f32[idxOffset + OFF_X] = node.x || 0;
      f32[idxOffset + OFF_Y] = node.y || 0;
      f32[idxOffset + OFF_ROT] = node.rotation || 0;
      f32[idxOffset + OFF_SX] = node.scaleX !== undefined ? node.scaleX : 1;
      f32[idxOffset + OFF_SY] = node.scaleY !== undefined ? node.scaleY : 1;
      f32[idxOffset + OFF_SKX] = node.skewX || 0;
      f32[idxOffset + OFF_SKY] = node.skewY || 0;
      f32[idxOffset + OFF_OPACITY] = node.opacity !== undefined ? node.opacity : 1;
      updateBufferFlags(idxOffset, true, node.visible !== false);
      
      const newNodes = { ...state.nodes, [node.id]: newNode };

      if (node.parentId) {
        const parent = newNodes[node.parentId];
        if (parent) {
          newNodes[node.parentId] = {
            ...parent,
            children: [...parent.children, node.id]
          };
          
          const parentIdx = idToIndex.get(node.parentId)!;
          i32[idxOffset + OFF_PARENT] = parentIdx;
          
          let currChild = i32[parentIdx * STRIDE + OFF_FIRST_CHILD];
          if (currChild === -1) {
            i32[parentIdx * STRIDE + OFF_FIRST_CHILD] = idx;
          } else {
            while (i32[currChild * STRIDE + OFF_NEXT_SIBLING] !== -1) {
              currChild = i32[currChild * STRIDE + OFF_NEXT_SIBLING];
            }
            i32[currChild * STRIDE + OFF_NEXT_SIBLING] = idx;
          }
        }
      }

      Object.defineProperties(newNode, {
        x: { get: () => f32[idxOffset + OFF_X], enumerable: true },
        y: { get: () => f32[idxOffset + OFF_Y], enumerable: true },
        rotation: { get: () => f32[idxOffset + OFF_ROT], enumerable: true },
        scaleX: { get: () => f32[idxOffset + OFF_SX], enumerable: true },
        scaleY: { get: () => f32[idxOffset + OFF_SY], enumerable: true },
        skewX: { get: () => f32[idxOffset + OFF_SKX], enumerable: true },
        skewY: { get: () => f32[idxOffset + OFF_SKY], enumerable: true },
        opacity: { get: () => f32[idxOffset + OFF_OPACITY], enumerable: true },
        visible: { get: () => (i32[idxOffset + OFF_FLAGS] & 2) !== 0, enumerable: true },
        isDirty: { get: () => (i32[idxOffset + OFF_FLAGS] & 1) !== 0, enumerable: true },
        localMatrix: { get: () => Array.from(f32.subarray(idxOffset + OFF_LM_START, idxOffset + OFF_LM_START + 9)), enumerable: true },
        worldMatrix: { get: () => Array.from(f32.subarray(idxOffset + OFF_WM_START, idxOffset + OFF_WM_START + 9)), enumerable: true }
      });

      return {
        nodes: newNodes,
        idToIndex,
        nextBufferIndex: idx + 1,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
      };
    });
  },

  updateNode: (id, updates) => {
    const state = get();
    const node = state.nodes[id];
    if (!node) return;

    const idx = node.bufferIndex;
    const idxOffset = idx * STRIDE;
    let needsStateUpdate = false;
    let newNodes = state.nodes;

    if (updates.x !== undefined) f32[idxOffset + OFF_X] = updates.x;
    if (updates.y !== undefined) f32[idxOffset + OFF_Y] = updates.y;
    if (updates.rotation !== undefined) f32[idxOffset + OFF_ROT] = updates.rotation;
    if (updates.scaleX !== undefined) f32[idxOffset + OFF_SX] = updates.scaleX;
    if (updates.scaleY !== undefined) f32[idxOffset + OFF_SY] = updates.scaleY;
    if (updates.skewX !== undefined) f32[idxOffset + OFF_SKX] = updates.skewX;
    if (updates.skewY !== undefined) f32[idxOffset + OFF_SKY] = updates.skewY;
    if (updates.opacity !== undefined) f32[idxOffset + OFF_OPACITY] = updates.opacity;
    if (updates.visible !== undefined) updateBufferFlags(idxOffset, undefined, updates.visible);
    
    updateBufferFlags(idxOffset, true);

    let hasNonBufferKeys = false;
    for (const k in updates) {
      if (k !== 'x' && k !== 'y' && k !== 'rotation' && k !== 'scaleX' && k !== 'scaleY' && k !== 'skewX' && k !== 'skewY' && k !== 'opacity' && k !== 'visible' && k !== 'isDirty') {
        hasNonBufferKeys = true;
        break;
      }
    }

    if (hasNonBufferKeys) {
      needsStateUpdate = true;
      const updatedNode = { ...node };
      for (const k in updates) {
        if (k !== 'x' && k !== 'y' && k !== 'rotation' && k !== 'scaleX' && k !== 'scaleY' && k !== 'skewX' && k !== 'skewY' && k !== 'opacity' && k !== 'visible' && k !== 'isDirty') {
          (updatedNode as any)[k] = (updates as any)[k];
        }
      }
      
      Object.defineProperties(updatedNode, {
        x: { get: () => f32[idxOffset + OFF_X], enumerable: true },
        y: { get: () => f32[idxOffset + OFF_Y], enumerable: true },
        rotation: { get: () => f32[idxOffset + OFF_ROT], enumerable: true },
        scaleX: { get: () => f32[idxOffset + OFF_SX], enumerable: true },
        scaleY: { get: () => f32[idxOffset + OFF_SY], enumerable: true },
        skewX: { get: () => f32[idxOffset + OFF_SKX], enumerable: true },
        skewY: { get: () => f32[idxOffset + OFF_SKY], enumerable: true },
        opacity: { get: () => f32[idxOffset + OFF_OPACITY], enumerable: true },
        visible: { get: () => (i32[idxOffset + OFF_FLAGS] & 2) !== 0, enumerable: true },
        isDirty: { get: () => (i32[idxOffset + OFF_FLAGS] & 1) !== 0, enumerable: true },
        localMatrix: { get: () => Array.from(f32.subarray(idxOffset + OFF_LM_START, idxOffset + OFF_LM_START + 9)), enumerable: true },
        worldMatrix: { get: () => Array.from(f32.subarray(idxOffset + OFF_WM_START, idxOffset + OFF_WM_START + 9)), enumerable: true }
      });

      newNodes = { ...state.nodes, [id]: updatedNode };
    }

    if (needsStateUpdate) {
      set({ nodes: newNodes });
    }
  },

  reorderNode: (id, newParentId, index) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };

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

      const updatedNode = { ...node, parentId: newParentId };
      const idxOffset = node.bufferIndex * STRIDE;
      
      Object.defineProperties(updatedNode, {
        x: { get: () => f32[idxOffset + OFF_X], enumerable: true },
        y: { get: () => f32[idxOffset + OFF_Y], enumerable: true },
        rotation: { get: () => f32[idxOffset + OFF_ROT], enumerable: true },
        scaleX: { get: () => f32[idxOffset + OFF_SX], enumerable: true },
        scaleY: { get: () => f32[idxOffset + OFF_SY], enumerable: true },
        skewX: { get: () => f32[idxOffset + OFF_SKX], enumerable: true },
        skewY: { get: () => f32[idxOffset + OFF_SKY], enumerable: true },
        opacity: { get: () => f32[idxOffset + OFF_OPACITY], enumerable: true },
        visible: { get: () => (i32[idxOffset + OFF_FLAGS] & 2) !== 0, enumerable: true },
        isDirty: { get: () => (i32[idxOffset + OFF_FLAGS] & 1) !== 0, enumerable: true },
        localMatrix: { get: () => Array.from(f32.subarray(idxOffset + OFF_LM_START, idxOffset + OFF_LM_START + 9)), enumerable: true },
        worldMatrix: { get: () => Array.from(f32.subarray(idxOffset + OFF_WM_START, idxOffset + OFF_WM_START + 9)), enumerable: true }
      });
      
      updateBufferFlags(idxOffset, true);
      newNodes[id] = updatedNode;

      return { nodes: newNodes };
    });
  },

  markDirty: (id) => {
    const state = get();
    const node = state.nodes[id];
    if (node) {
      updateBufferFlags(node.bufferIndex * STRIDE, true);
    }
  },

  recalculateMatrices: () => {
    const state = get();
    if (!state.rootId) return;
    
    const rootIndex = state.idToIndex.get(state.rootId);
    if (rootIndex !== undefined) {
      if (worker) {
        worker.postMessage({ type: 'TICK', rootIndex });
      } else {
        // Fallback for environments without Web Worker (e.g., Node.js tests)
        const multiplyMatrix = (a: Float32Array, aOffset: number, b: Float32Array, bOffset: number, out: Float32Array, outOffset: number) => {
          const a00 = a[aOffset + 0], a01 = a[aOffset + 1], a02 = a[aOffset + 2];
          const a10 = a[aOffset + 3], a11 = a[aOffset + 4], a12 = a[aOffset + 5];
          const a20 = a[aOffset + 6], a21 = a[aOffset + 7], a22 = a[aOffset + 8];

          const b00 = b[bOffset + 0], b01 = b[bOffset + 1], b02 = b[bOffset + 2];
          const b10 = b[bOffset + 3], b11 = b[bOffset + 4], b12 = b[bOffset + 5];
          const b20 = b[bOffset + 6], b21 = b[bOffset + 7], b22 = b[bOffset + 8];

          out[outOffset + 0] = b00 * a00 + b01 * a10 + b02 * a20;
          out[outOffset + 1] = b00 * a01 + b01 * a11 + b02 * a21;
          out[outOffset + 2] = b00 * a02 + b01 * a12 + b02 * a22;
          out[outOffset + 3] = b10 * a00 + b11 * a10 + b12 * a20;
          out[outOffset + 4] = b10 * a01 + b11 * a11 + b12 * a21;
          out[outOffset + 5] = b10 * a02 + b11 * a12 + b12 * a22;
          out[outOffset + 6] = b20 * a00 + b21 * a10 + b22 * a20;
          out[outOffset + 7] = b20 * a01 + b21 * a11 + b22 * a21;
          out[outOffset + 8] = b20 * a02 + b21 * a12 + b22 * a22;
        };

        const m = new Float32Array(9);
        const rotM = new Float32Array(9);
        const mSkew = new Float32Array(9);
        const scaleM = new Float32Array(9);
        const temp1 = new Float32Array(9);
        const temp2 = new Float32Array(9);
        const temp3 = new Float32Array(9);

        const computeLocalMatrix = (idx: number) => {
          const x = f32[idx + OFF_X];
          const y = f32[idx + OFF_Y];
          const rot = f32[idx + OFF_ROT];
          const sx = f32[idx + OFF_SX];
          const sy = f32[idx + OFF_SY];
          const skx = f32[idx + OFF_SKX];
          const sky = f32[idx + OFF_SKY];

          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          
          m[0] = 1; m[1] = 0; m[2] = 0;
          m[3] = 0; m[4] = 1; m[5] = 0;
          m[6] = x; m[7] = y; m[8] = 1;
          
          rotM[0] = cos; rotM[1] = sin; rotM[2] = 0;
          rotM[3] = -sin; rotM[4] = cos; rotM[5] = 0;
          rotM[6] = 0; rotM[7] = 0; rotM[8] = 1;
          
          multiplyMatrix(m, 0, rotM, 0, temp1, 0);
          
          if (skx !== 0 || sky !== 0) {
            mSkew[0] = 1; mSkew[1] = Math.tan(sky); mSkew[2] = 0;
            mSkew[3] = Math.tan(skx); mSkew[4] = 1; mSkew[5] = 0;
            mSkew[6] = 0; mSkew[7] = 0; mSkew[8] = 1;
            
            multiplyMatrix(temp1, 0, mSkew, 0, temp2, 0);
            temp1.set(temp2);
          }

          scaleM[0] = sx; scaleM[1] = 0; scaleM[2] = 0;
          scaleM[3] = 0; scaleM[4] = sy; scaleM[5] = 0;
          scaleM[6] = 0; scaleM[7] = 0; scaleM[8] = 1;
          
          multiplyMatrix(temp1, 0, scaleM, 0, temp3, 0);

          for (let i = 0; i < 9; i++) {
            f32[idx + OFF_LM_START + i] = temp3[i];
          }
        };

        const traverse = (nodeIndex: number, parentWasDirty: boolean) => {
          const idx = nodeIndex * STRIDE;
          const flags = i32[idx + OFF_FLAGS];
          const isDirty = (flags & 1) !== 0;
          
          const isNowDirty = isDirty || parentWasDirty;

          if (isNowDirty) {
            computeLocalMatrix(idx);
            
            const parentIndex = i32[idx + OFF_PARENT];
            if (parentIndex !== -1) {
              multiplyMatrix(f32, parentIndex * STRIDE + OFF_WM_START, f32, idx + OFF_LM_START, f32, idx + OFF_WM_START);
            } else {
              for (let i = 0; i < 9; i++) {
                f32[idx + OFF_WM_START + i] = f32[idx + OFF_LM_START + i];
              }
            }
            
            i32[idx + OFF_FLAGS] = flags & ~1;
          }

          let childIndex = i32[idx + OFF_FIRST_CHILD];
          while (childIndex !== -1) {
            traverse(childIndex, isNowDirty);
            childIndex = i32[childIndex * STRIDE + OFF_NEXT_SIBLING];
          }
        };

        traverse(rootIndex, false);
      }
    }
  }
}));
