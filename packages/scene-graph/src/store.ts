import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix, copyMatrix } from '@monorepo/math';

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
  children?: string[];
  childrenNodes?: SceneNode[];
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  remoteSelections: Record<string, { nodeId: string; color: string; userName?: string }>;
  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => void;
  updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  addNodesBulk: (nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => void;
}

const getDefaultNode = (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty' | 'children'>> & { id: string, type: NodeType }): SceneNode => ({
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
  children: (node as any).children || []
});

import { syncMiddleware, SyncMessage } from './sync';

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

  addNodesBulk: (nodesToAdd: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      let newRootId = state.rootId;
      for (let i = 0; i < nodesToAdd.length; i++) {
        const node = nodesToAdd[i];
        const newNode = getDefaultNode(node);
        newNode.children = [];
        newNode.childrenNodes = [];
        newNodes[node.id] = newNode;
        if (!newRootId && node.parentId === null) {
          newRootId = node.id;
        }
      }
      for (const id in newNodes) {
        const n = newNodes[id];
        if (n.parentId && newNodes[n.parentId]) {
          const parent = newNodes[n.parentId];
          if (!parent.children) parent.children = [];
          if (!parent.childrenNodes) parent.childrenNodes = [];
          parent.children.push(id);
          parent.childrenNodes.push(n);
        }
      }
      return { nodes: newNodes, rootId: newRootId };
    });
  },

  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => {
    set((state: SceneGraphState) => {
      const newNode = getDefaultNode(node);
      newNode.children = [];
      newNode.childrenNodes = [];
      
      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
      siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
      const lastSibling = siblings[siblings.length - 1];
      newNode.order = generateKeyBetween(lastSibling?.order || null, null);
      
      const newNodes = { ...state.nodes, [node.id]: newNode };
      if (newNode.parentId && newNodes[newNode.parentId]) {
        const parent = newNodes[newNode.parentId];
        newNodes[newNode.parentId] = {
          ...parent,
          children: [...(parent.children || []), node.id],
          childrenNodes: [...(parent.childrenNodes || []), newNode]
        };
      }
      
      return {
        nodes: newNodes,
        rootId: state.rootId || (node.parentId === null ? node.id : state.rootId)
      };
    }, false, { type: 'addNode', payload: node });
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
      const nodes = state.nodes;
      const { rootId } = state;

      if (!rootId || !nodes[rootId]) return state;

      const traverse = (node: SceneNode, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const isWorldDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;
        const isParentIdentity = parentWorldMatrix[0] === 1 && parentWorldMatrix[4] === 1 && parentWorldMatrix[1] === 0 && parentWorldMatrix[3] === 0 && parentWorldMatrix[6] === 0 && parentWorldMatrix[7] === 0;

        if (isWorldDirty) {
          if (node.isDirty) {
            if (!node.localMatrix) node.localMatrix = createMatrix();
            getTransformMatrix(
              node.localMatrix,
              node.x, node.y, 
              node.rotation, 
              node.scaleX, node.scaleY,
              node.skewX || 0, node.skewY || 0
            );
            node.isDirty = false;
          }
          if (!node.worldMatrix) node.worldMatrix = createMatrix();
          if (isParentIdentity) {
            copyMatrix(node.worldMatrix, node.localMatrix);
          } else {
            multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
          }
          currentWorldMatrix = node.worldMatrix;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        const children = node.childrenNodes || (node.children ? node.children.map(id => nodes[id]).filter(Boolean) : undefined);
        if (children) {
          const isCurrIdentity = currentWorldMatrix[0] === 1 && currentWorldMatrix[4] === 1 && currentWorldMatrix[1] === 0 && currentWorldMatrix[3] === 0 && currentWorldMatrix[6] === 0 && currentWorldMatrix[7] === 0;
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childDirty = child.isDirty || isWorldDirty;
            if (!child.childrenNodes || child.childrenNodes.length === 0) {
              if (childDirty) {
                if (child.isDirty) {
                  if (!child.localMatrix) child.localMatrix = createMatrix();
                  getTransformMatrix(
                    child.localMatrix,
                    child.x, child.y, 
                    child.rotation, 
                    child.scaleX, child.scaleY,
                    child.skewX || 0, child.skewY || 0
                  );
                  child.isDirty = false;
                }
                if (!child.worldMatrix) child.worldMatrix = createMatrix();
                if (isCurrIdentity) {
                  copyMatrix(child.worldMatrix, child.localMatrix);
                } else {
                  multiplyMatrix(child.worldMatrix, currentWorldMatrix, child.localMatrix);
                }
              }
            } else {
              traverse(child, currentWorldMatrix, isWorldDirty);
            }
          }
        }
      };

      traverse(nodes[rootId], createMatrix(), false);

      return state;
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
