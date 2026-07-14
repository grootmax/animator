import { createStore } from 'zustand/vanilla';
import { Matrix3 } from '@monorepo/math';

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

  localMatrix: Matrix3 | Float32Array;
  worldMatrix: Matrix3 | Float32Array;
  isDirty: boolean;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  subscribeToChanges: (listener: (changedNodes: Set<string>) => void) => () => void;
  flushChanges: () => void;
}

const MAX_NODES = 200000;
const NODE_STRIDE = 32;

const X = 0;
const Y = 1;
const ROTATION = 2;
const SCALE_X = 3;
const SCALE_Y = 4;
const SKEW_X = 5;
const SKEW_Y = 6;
const OPACITY = 7;
const VISIBLE = 8;
const LOCKED = 9;
const IS_DIRTY = 10;
const LOCAL_MATRIX = 11;
const WORLD_MATRIX = 20;

function getTransformMatrixInPlace(out: Float32Array, outOffset: number, x: number, y: number, rotation: number, scaleX: number, scaleY: number, skewX: number, skewY: number) {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  
  let a00 = c, a01 = s, a02 = 0;
  let a10 = -s, a11 = c, a12 = 0;
  let a20 = x, a21 = y, a22 = 1;

  if (skewX !== 0 || skewY !== 0) {
    const tx = Math.tan(skewX);
    const ty = Math.tan(skewY);
    
    const b00 = 1, b01 = ty, b02 = 0;
    const b10 = tx, b11 = 1, b12 = 0;
    const b20 = 0, b21 = 0, b22 = 1;
    
    const n00 = b00 * a00 + b01 * a10 + b02 * a20;
    const n01 = b00 * a01 + b01 * a11 + b02 * a21;
    const n02 = b00 * a02 + b01 * a12 + b02 * a22;
    
    const n10 = b10 * a00 + b11 * a10 + b12 * a20;
    const n11 = b10 * a01 + b11 * a11 + b12 * a21;
    const n12 = b10 * a02 + b11 * a12 + b12 * a22;
    
    const n20 = b20 * a00 + b21 * a10 + b22 * a20;
    const n21 = b20 * a01 + b21 * a11 + b22 * a21;
    const n22 = b20 * a02 + b21 * a12 + b22 * a22;

    a00 = n00; a01 = n01; a02 = n02;
    a10 = n10; a11 = n11; a12 = n12;
    a20 = n20; a21 = n21; a22 = n22;
  }

  a00 *= scaleX; a01 *= scaleX; a02 *= scaleX;
  a10 *= scaleY; a11 *= scaleY; a12 *= scaleY;

  out[outOffset + 0] = a00; out[outOffset + 1] = a01; out[outOffset + 2] = a02;
  out[outOffset + 3] = a10; out[outOffset + 4] = a11; out[outOffset + 5] = a12;
  out[outOffset + 6] = a20; out[outOffset + 7] = a21; out[outOffset + 8] = a22;
}

function multiplyMatrixInPlace(out: Float32Array, outOffset: number, a: Float32Array, aOffset: number, b: Float32Array, bOffset: number) {
  const a00 = a[aOffset+0], a01 = a[aOffset+1], a02 = a[aOffset+2];
  const a10 = a[aOffset+3], a11 = a[aOffset+4], a12 = a[aOffset+5];
  const a20 = a[aOffset+6], a21 = a[aOffset+7], a22 = a[aOffset+8];

  const b00 = b[bOffset+0], b01 = b[bOffset+1], b02 = b[bOffset+2];
  const b10 = b[bOffset+3], b11 = b[bOffset+4], b12 = b[bOffset+5];
  const b20 = b[bOffset+6], b21 = b[bOffset+7], b22 = b[bOffset+8];

  out[outOffset + 0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[outOffset + 1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[outOffset + 2] = b00 * a02 + b01 * a12 + b02 * a22;
  
  out[outOffset + 3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[outOffset + 4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[outOffset + 5] = b10 * a02 + b11 * a12 + b12 * a22;
  
  out[outOffset + 6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[outOffset + 7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[outOffset + 8] = b20 * a02 + b21 * a12 + b22 * a22;
}

export const createSceneGraphStore = () => {
  const buffer = new Float32Array(MAX_NODES * NODE_STRIDE);
  let nextNodeIndex = 0;
  
  const idToIndex = new Map<string, number>();
  const listeners = new Set<(changedNodes: Set<string>) => void>();
  const changedNodesThisFrame = new Set<string>();

  const store = createStore<SceneGraphState>((set, get) => {
    
    function allocateNode(id: string) {
      const index = nextNodeIndex++;
      idToIndex.set(id, index);
      const base = index * NODE_STRIDE;
      
      buffer[base + LOCAL_MATRIX + 0] = 1;
      buffer[base + LOCAL_MATRIX + 4] = 1;
      buffer[base + LOCAL_MATRIX + 8] = 1;
      
      buffer[base + WORLD_MATRIX + 0] = 1;
      buffer[base + WORLD_MATRIX + 4] = 1;
      buffer[base + WORLD_MATRIX + 8] = 1;

      buffer[base + SCALE_X] = 1;
      buffer[base + SCALE_Y] = 1;
      buffer[base + OPACITY] = 1;
      buffer[base + VISIBLE] = 1;
      buffer[base + LOCKED] = 0;
      buffer[base + IS_DIRTY] = 1;
      
      return index;
    }

    class NodeProxy {
      id: string;
      name: string;
      type: NodeType;
      parentId: string | null;
      children: string[];
      
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

      localMatrix: Float32Array;
      worldMatrix: Float32Array;

      constructor(id: string, initialData: any, index: number) {
        this.id = id;
        this.name = initialData.name || id;
        this.type = initialData.type;
        this.parentId = initialData.parentId || null;
        this.children = initialData.children || [];
        
        Object.assign(this, initialData);

        const base = index * NODE_STRIDE;
        this.localMatrix = buffer.subarray(base + LOCAL_MATRIX, base + LOCAL_MATRIX + 9);
        this.worldMatrix = buffer.subarray(base + WORLD_MATRIX, base + WORLD_MATRIX + 9);
      }

      get x() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + X]; }
      set x(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + X] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get y() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + Y]; }
      set y(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + Y] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get rotation() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + ROTATION]; }
      set rotation(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + ROTATION] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get scaleX() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + SCALE_X]; }
      set scaleX(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + SCALE_X] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get scaleY() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + SCALE_Y]; }
      set scaleY(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + SCALE_Y] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get skewX() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + SKEW_X]; }
      set skewX(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + SKEW_X] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get skewY() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + SKEW_Y]; }
      set skewY(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + SKEW_Y] = v; buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = 1; }

      get opacity() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + OPACITY]; }
      set opacity(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + OPACITY] = v; }

      get visible() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + VISIBLE] === 1; }
      set visible(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + VISIBLE] = v ? 1 : 0; }

      get locked() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + LOCKED] === 1; }
      set locked(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + LOCKED] = v ? 1 : 0; }

      get isDirty() { return buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] === 1; }
      set isDirty(v) { buffer[idToIndex.get(this.id)! * NODE_STRIDE + IS_DIRTY] = v ? 1 : 0; }
    }

    return {
      nodes: {} as Record<string, SceneNode>,
      rootId: null,

      subscribeToChanges: (listener: (changedNodes: Set<string>) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },

      flushChanges: () => {
        if (changedNodesThisFrame.size > 0) {
          listeners.forEach(l => l(changedNodesThisFrame));
          changedNodesThisFrame.clear();
        }
      },

      addNode: (nodeData) => {
        set((state) => {
          const index = allocateNode(nodeData.id);
          const proxy = new NodeProxy(nodeData.id, nodeData, index);
          
          if (nodeData.x !== undefined) proxy.x = nodeData.x;
          if (nodeData.y !== undefined) proxy.y = nodeData.y;
          if (nodeData.rotation !== undefined) proxy.rotation = nodeData.rotation;
          if (nodeData.scaleX !== undefined) proxy.scaleX = nodeData.scaleX;
          if (nodeData.scaleY !== undefined) proxy.scaleY = nodeData.scaleY;
          if (nodeData.skewX !== undefined) proxy.skewX = nodeData.skewX;
          if (nodeData.skewY !== undefined) proxy.skewY = nodeData.skewY;
          if (nodeData.opacity !== undefined) proxy.opacity = nodeData.opacity;
          if (nodeData.visible !== undefined) proxy.visible = nodeData.visible;
          if (nodeData.locked !== undefined) proxy.locked = nodeData.locked;

          const newNodes = { ...state.nodes, [nodeData.id]: proxy };

          if (nodeData.parentId && newNodes[nodeData.parentId]) {
            const parent = newNodes[nodeData.parentId];
            newNodes[nodeData.parentId] = Object.assign(Object.create(Object.getPrototypeOf(parent)), parent, {
              children: [...parent.children, nodeData.id]
            });
          }

          changedNodesThisFrame.add(nodeData.id);
          if (nodeData.parentId) changedNodesThisFrame.add(nodeData.parentId);

          return {
            nodes: newNodes,
            rootId: state.rootId || (nodeData.parentId === null ? nodeData.id : state.rootId)
          };
        });
      },

      updateNode: (id, updates) => {
        const state = get();
        const node = state.nodes[id];
        if (!node) return;

        if (updates.x !== undefined) { node.x = updates.x; }
        if (updates.y !== undefined) { node.y = updates.y; }
        if (updates.rotation !== undefined) { node.rotation = updates.rotation; }
        if (updates.scaleX !== undefined) { node.scaleX = updates.scaleX; }
        if (updates.scaleY !== undefined) { node.scaleY = updates.scaleY; }
        if (updates.skewX !== undefined) { node.skewX = updates.skewX; }
        if (updates.skewY !== undefined) { node.skewY = updates.skewY; }
        if (updates.opacity !== undefined) { node.opacity = updates.opacity; }
        if (updates.visible !== undefined) { node.visible = updates.visible; }
        if (updates.locked !== undefined) { node.locked = updates.locked; }

        if (updates.name !== undefined) node.name = updates.name;
        if (updates.width !== undefined) node.width = updates.width;
        if (updates.height !== undefined) node.height = updates.height;
        if (updates.radius !== undefined) node.radius = updates.radius;
        if (updates.fill !== undefined) node.fill = updates.fill;
        if (updates.stroke !== undefined) node.stroke = updates.stroke;
        if (updates.strokeWidth !== undefined) node.strokeWidth = updates.strokeWidth;
        if (updates.pathData !== undefined) node.pathData = updates.pathData;
        if (updates.rx !== undefined) node.rx = updates.rx;
        if (updates.ry !== undefined) node.ry = updates.ry;
        if (updates.x1 !== undefined) node.x1 = updates.x1;
        if (updates.y1 !== undefined) node.y1 = updates.y1;
        if (updates.x2 !== undefined) node.x2 = updates.x2;
        if (updates.y2 !== undefined) node.y2 = updates.y2;
        if (updates.points !== undefined) node.points = updates.points;

        node.isDirty = true;
        changedNodesThisFrame.add(id);
      },

      reorderNode: (id, newParentId, index) => {
        set((state) => {
          const node = state.nodes[id];
          if (!node) return state;

          const newNodes = { ...state.nodes };

          if (node.parentId && newNodes[node.parentId]) {
            const parent = newNodes[node.parentId];
            newNodes[node.parentId] = Object.assign(Object.create(Object.getPrototypeOf(parent)), parent, {
              children: parent.children.filter(childId => childId !== id)
            });
            changedNodesThisFrame.add(node.parentId);
          }

          if (newParentId && newNodes[newParentId]) {
            const newParent = newNodes[newParentId];
            const newChildren = [...newParent.children];
            newChildren.splice(index, 0, id);
            newNodes[newParentId] = Object.assign(Object.create(Object.getPrototypeOf(newParent)), newParent, {
              children: newChildren
            });
            changedNodesThisFrame.add(newParentId);
          }

          newNodes[id] = Object.assign(Object.create(Object.getPrototypeOf(node)), node, {
            parentId: newParentId
          });
          newNodes[id].isDirty = true;
          changedNodesThisFrame.add(id);

          return { nodes: newNodes };
        });
      },

      markDirty: (id) => {
        const state = get();
        const node = state.nodes[id];
        if (node) {
          node.isDirty = true;
          changedNodesThisFrame.add(id);
        }
      },

      recalculateMatrices: () => {
        const state = get();
        const { rootId, nodes } = state;

        if (!rootId) return;

        const rootIndex = idToIndex.get(rootId);
        if (rootIndex === undefined) return;

        const identity = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

        const traverse = (nodeId: string, parentWorldMatrix: Float32Array, parentWorldOffset: number, parentWasDirty: boolean) => {
          const idx = idToIndex.get(nodeId);
          if (idx === undefined) return;

          const base = idx * NODE_STRIDE;
          const isNowDirty = (buffer[base + IS_DIRTY] === 1) || parentWasDirty;

          if (isNowDirty) {
            getTransformMatrixInPlace(
              buffer, base + LOCAL_MATRIX,
              buffer[base + X],
              buffer[base + Y],
              buffer[base + ROTATION],
              buffer[base + SCALE_X],
              buffer[base + SCALE_Y],
              buffer[base + SKEW_X] || 0,
              buffer[base + SKEW_Y] || 0
            );

            multiplyMatrixInPlace(
              buffer, base + WORLD_MATRIX,
              parentWorldMatrix, parentWorldOffset,
              buffer, base + LOCAL_MATRIX
            );

            buffer[base + IS_DIRTY] = 0;
            changedNodesThisFrame.add(nodeId);
          }

          const node = nodes[nodeId];
          for (let i = 0; i < node.children.length; i++) {
            traverse(node.children[i], buffer, base + WORLD_MATRIX, isNowDirty);
          }
        };

        traverse(rootId, identity, 0, false);
      }
    };
  });

  return store;
};
