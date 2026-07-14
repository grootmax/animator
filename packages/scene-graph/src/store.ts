import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';
import { AssetRegistry } from './assetRegistry';
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
  assetId?: string;

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
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  deleteNode: (id: string) => void;
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

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  const config = (set: any, get: any) => ({
  nodes: {},
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
      
      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
      siblings.sort((a: any, b: any) => {
        const oa = a.order || '';
        const ob = b.order || '';
        return oa < ob ? -1 : oa > ob ? 1 : 0;
      });
      const lastSibling = siblings[siblings.length - 1];
      newNode.order = generateKeyBetween(lastSibling?.order || null, null);
      
      const newNodes = { ...state.nodes, [node.id]: newNode };
      
      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
      };
    }, false, { type: 'addNode', payload: node });
  },

  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      let rootId = state.rootId;

      for (const node of nodes) {
        const newNode = getDefaultNode(node);
        if (!rootId && node.parentId === null) {
          rootId = node.id;
        }
        newNodes[node.id] = newNode;
      }

      return { nodes: newNodes, rootId };
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

  deleteNode: (id: string) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };
      
      const deleteRecursive = (nodeId: string) => {
        const n = newNodes[nodeId];
        if (!n) return;
        
        const children = Object.values(newNodes).filter((other) => other.parentId === nodeId);
        children.forEach((child) => deleteRecursive(child.id));
        
        // Remove asset if it's an image and no other node references it
        if (n.type === 'image' && n.assetId) {
          const isReferencedElsewhere = Object.values(newNodes).some(
            (otherNode) => otherNode.id !== nodeId && otherNode.type === 'image' && otherNode.assetId === n.assetId
          );
          if (!isReferencedElsewhere) {
            AssetRegistry.removeAsset(n.assetId);
          }
        }
        
        delete newNodes[nodeId];
      };
      
      deleteRecursive(id);

      return { nodes: newNodes, rootId: state.rootId === id ? null : state.rootId };
    });
  },

  reorderNode: (id: string, newParentId: string | null, index: number) => {
    set((state: SceneGraphState) => {
      const node = state.nodes[id];
      if (!node) return state;

      const newNodes = { ...state.nodes };

      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === newParentId && n.id !== id);
      siblings.sort((a, b) => {
        const oa = a.order || '';
        const ob = b.order || '';
        return oa < ob ? -1 : oa > ob ? 1 : 0;
      });

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

      // O(1) dirty marking
      const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };

      return { nodes: newNodes };
    });
  },

  recalculateMatrices: () => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      const { rootId } = state;
      const childrenMap: Record<string, string[]> = {};
      Object.values(newNodes).forEach((n: any) => {
        if (n.parentId) {
          const p = n.parentId;
          if (!childrenMap[p]) childrenMap[p] = [];
          childrenMap[p].push(n.id);
        }
      });
      for (const k in childrenMap) {
        childrenMap[k].sort((a: string, b: string) => {
          const oa = (newNodes as any)[a].order || '';
          const ob = (newNodes as any)[b].order || '';
          return oa < ob ? -1 : oa > ob ? 1 : 0;
        });
      }

      if (!rootId || !newNodes[rootId]) return state;

      const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const node = newNodes[nodeId];
        if (!node) return;

        const isWorldDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isWorldDirty) {
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
          multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
          currentWorldMatrix = node.worldMatrix;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        const children = childrenMap[nodeId] || [];
        for (let i = 0; i < children.length; i++) {
          traverse(children[i], currentWorldMatrix, isWorldDirty);
        }
      };

      traverse(rootId, createMatrix(), false);

      return { nodes: newNodes };
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
