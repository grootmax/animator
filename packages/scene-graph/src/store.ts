import { createStore } from 'zustand/vanilla';
import { Matrix3 } from '@monorepo/math';
import { NodeBuffer, OFFSET_X, OFFSET_Y, OFFSET_ROTATION, OFFSET_SCALE_X, OFFSET_SCALE_Y, OFFSET_SKEW_X, OFFSET_SKEW_Y, OFFSET_OPACITY, OFFSET_LOCAL_MATRIX, OFFSET_WORLD_MATRIX, OFFSET_DIRTY } from './buffer';
import { updateLocalMatrixInPlace, multiplyMatrixInPlace } from './math-in-place';

export type NodeType = 'container' | 'rect' | 'circle' | 'path' | 'group' | 'ellipse' | 'line' | 'polyline';

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  children: string[];
  
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

  bufferOffset: number;

  get x(): number;
  set x(v: number);
  get y(): number;
  set y(v: number);
  get rotation(): number;
  set rotation(v: number);
  get scaleX(): number;
  set scaleX(v: number);
  get scaleY(): number;
  set scaleY(v: number);
  get skewX(): number;
  set skewX(v: number);
  get skewY(): number;
  set skewY(v: number);
  get opacity(): number;
  set opacity(v: number);

  get localMatrix(): Float32Array;
  get worldMatrix(): Float32Array;
  get isDirty(): boolean;
  set isDirty(v: boolean);
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  nodeBuffer: NodeBuffer;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'children' | 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
}

const defineCompatibilityLayer = (node: any, nodeBuffer: NodeBuffer) => {
  Object.defineProperties(node, {
    x: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_X]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_X] = v; } },
    y: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_Y]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_Y] = v; } },
    rotation: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_ROTATION]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_ROTATION] = v; } },
    scaleX: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_SCALE_X]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_SCALE_X] = v; } },
    scaleY: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_SCALE_Y]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_SCALE_Y] = v; } },
    skewX: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_SKEW_X]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_SKEW_X] = v; } },
    skewY: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_SKEW_Y]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_SKEW_Y] = v; } },
    opacity: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_OPACITY]; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_OPACITY] = v; } },
    isDirty: { get() { return nodeBuffer.buffer[this.bufferOffset + OFFSET_DIRTY] === 1; }, set(v) { nodeBuffer.buffer[this.bufferOffset + OFFSET_DIRTY] = v ? 1 : 0; } },
    localMatrix: { get() { return nodeBuffer.buffer.subarray(this.bufferOffset + OFFSET_LOCAL_MATRIX, this.bufferOffset + OFFSET_LOCAL_MATRIX + 9); } },
    worldMatrix: { get() { return nodeBuffer.buffer.subarray(this.bufferOffset + OFFSET_WORLD_MATRIX, this.bufferOffset + OFFSET_WORLD_MATRIX + 9); } },
  });
};

const getDefaultNode = (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'bufferOffset'>> & { id: string, type: NodeType }, bufferOffset: number, nodeBuffer: NodeBuffer): SceneNode => {
  const baseNode = {
    parentId: null,
    children: [],
    name: node.id,
    visible: true,
    locked: false,
    ...node,
    bufferOffset,
  };
  
  defineCompatibilityLayer(baseNode, nodeBuffer);
  
  const sn = baseNode as unknown as SceneNode;
  sn.x = node.x ?? 0;
  sn.y = node.y ?? 0;
  sn.rotation = node.rotation ?? 0;
  sn.scaleX = node.scaleX ?? 1;
  sn.scaleY = node.scaleY ?? 1;
  sn.skewX = node.skewX ?? 0;
  sn.skewY = node.skewY ?? 0;
  sn.opacity = node.opacity ?? 1;
  sn.isDirty = true;
  
  return sn;
};

export const createSceneGraphStore = () => {
  const initialBuffer = new NodeBuffer(1000);
  
  return createStore<SceneGraphState>((set, get) => ({
    nodes: {},
    rootId: null,
    nodeBuffer: initialBuffer,

    addNode: (node) => {
      set((state) => {
        const offset = state.nodeBuffer.allocate();
        const newNode = getDefaultNode(node, offset, state.nodeBuffer);
        const newNodes = { ...state.nodes, [node.id]: newNode };

        if (node.parentId) {
          const parent = newNodes[node.parentId];
          if (parent) {
            newNodes[node.parentId] = {
              ...parent,
              children: [...parent.children, node.id]
            };
            defineCompatibilityLayer(newNodes[node.parentId], state.nodeBuffer);
          }
        }

        return {
          nodes: newNodes,
          rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
        };
      });
    },

    updateNode: (id, updates) => {
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;

        const bufferProps = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity'];
        let hasObjectUpdates = false;
        
        for (const [key, value] of Object.entries(updates)) {
          if (bufferProps.includes(key)) {
            (node as any)[key] = value;
          } else {
            hasObjectUpdates = true;
          }
        }
        
        node.isDirty = true;

        if (hasObjectUpdates) {
          const newNode = { ...node };
          // Need to copy all updates that are object properties
          for (const [key, value] of Object.entries(updates)) {
             if (!bufferProps.includes(key)) {
               (newNode as any)[key] = value;
             }
          }
          defineCompatibilityLayer(newNode, state.nodeBuffer);
          const newNodes = { ...state.nodes, [id]: newNode as unknown as SceneNode };
          return { nodes: newNodes };
        }

        // If only buffer properties updated, return the same state object
        // to avoid React re-renders. We just rely on in-place mutations.
        return state;
      });
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
          defineCompatibilityLayer(newNodes[node.parentId], state.nodeBuffer);
        }

        if (newParentId && newNodes[newParentId]) {
          const newParent = newNodes[newParentId];
          const newChildren = [...newParent.children];
          newChildren.splice(index, 0, id);
          newNodes[newParentId] = {
            ...newParent,
            children: newChildren
          };
          defineCompatibilityLayer(newNodes[newParentId], state.nodeBuffer);
        }

        const updatedNode = { ...node, parentId: newParentId };
        defineCompatibilityLayer(updatedNode, state.nodeBuffer);
        updatedNode.isDirty = true;
        newNodes[id] = updatedNode as unknown as SceneNode;

        return { nodes: newNodes };
      });
    },

    markDirty: (id) => {
      set((state) => {
        const node = state.nodes[id];
        if (node) {
           node.isDirty = true;
        }
        return state;
      });
    },

    recalculateMatrices: () => {
      set((state) => {
        const nodes = state.nodes;
        const rootId = state.rootId;
        if (!rootId || !nodes[rootId]) return state;
        
        const buffer = state.nodeBuffer.buffer;
        const IDENTITY = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

        const traverse = (nodeId: string, parentWorldMatrix: Float32Array, parentWasDirty: boolean) => {
          const node = nodes[nodeId];
          if (!node) return;

          const isNowDirty = node.isDirty || parentWasDirty;
          const offset = node.bufferOffset;
          
          let currentWorldMatrix = parentWorldMatrix;

          if (isNowDirty) {
            updateLocalMatrixInPlace(buffer, offset);
            
            const worldOffset = offset + OFFSET_WORLD_MATRIX;
            multiplyMatrixInPlace(buffer, worldOffset, parentWorldMatrix, 0, buffer, offset + OFFSET_LOCAL_MATRIX);
            
            currentWorldMatrix = buffer.subarray(worldOffset, worldOffset + 9);
            node.isDirty = false;
          } else {
            const worldOffset = offset + OFFSET_WORLD_MATRIX;
            currentWorldMatrix = buffer.subarray(worldOffset, worldOffset + 9);
          }

          for (const childId of node.children) {
            traverse(childId, currentWorldMatrix, isNowDirty);
          }
        };

        traverse(rootId, IDENTITY, false);
        return state;
      });
    }
  }));
};
