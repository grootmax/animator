import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';

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

  children?: string[];
  childrenNodes?: SceneNode[];

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

  addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => {
    set((state: SceneGraphState) => {
      const newNode = getDefaultNode(node);
      
      const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
      siblings.sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
      const lastSibling = siblings[siblings.length - 1];
      newNode.order = generateKeyBetween(lastSibling?.order || null, null);
      
      const newNodes = { ...state.nodes, [node.id]: newNode };
      if (node.parentId && newNodes[node.parentId]) {
        const parent = newNodes[node.parentId];
        newNodes[node.parentId] = {
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

  addNodesBulk: (nodesToAdd: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      let newRootId = state.rootId;
      const clonedParents = new Set<string>();
      for (const node of nodesToAdd) {
        const newNode = getDefaultNode(node);
        newNodes[node.id] = newNode;
        if (node.parentId === null && !newRootId) {
          newRootId = node.id;
        }
      }
      for (const node of nodesToAdd) {
        if (node.parentId) {
          const parent = newNodes[node.parentId];
          if (parent) {
            if (!clonedParents.has(node.parentId)) {
              newNodes[node.parentId] = {
                ...parent,
                children: [...(parent.children || [])],
                childrenNodes: [...(parent.childrenNodes || [])]
              };
              clonedParents.add(node.parentId);
            }
            const p = newNodes[node.parentId];
            p.children!.push(node.id);
            if (!p.childrenNodes) p.childrenNodes = [];
            p.childrenNodes.push(newNodes[node.id]);
          }
        }
      }
      return {
        nodes: newNodes,
        rootId: newRootId
      };
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

  updateNodesBatch: (updates: Record<string, Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>>) => {
    set((state: SceneGraphState) => {
      const newNodes = { ...state.nodes };
      let hasChanges = false;
      const SPATIAL_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY'];
      for (const [id, nodeUpdates] of Object.entries(updates)) {
        const node = newNodes[id];
        if (node) {
          const hasSpatialUpdate = Object.keys(nodeUpdates).some(key => SPATIAL_PROPERTIES.includes(key));
          const isDirty = node.isDirty || hasSpatialUpdate;
          newNodes[id] = { ...node, ...nodeUpdates, isDirty };
          hasChanges = true;
        }
      }
      return hasChanges ? { nodes: newNodes } : state;
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
      const { rootId, nodes } = state;
      if (!rootId || !nodes[rootId]) return state;

      let childrenMap: Record<string, string[]> | null = null;

      const getChildren = (nodeId: string, node: SceneNode): string[] => {
        if (node.children && node.children.length > 0) return node.children;
        if (!childrenMap) {
          childrenMap = {};
          Object.values(nodes).forEach((n: any) => {
            const p = n.parentId || 'root';
            if (!childrenMap![p]) childrenMap![p] = [];
            childrenMap![p].push(n.id);
          });
          for (const k in childrenMap) {
            childrenMap[k].sort((a: any, b: any) => ((nodes as any)[a].order || '').localeCompare((nodes as any)[b].order || ''));
          }
        }
        return childrenMap[nodeId] || [];
      };

      const traverse = (node: SceneNode, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
        const isWorldDirty = node.isDirty || parentWasDirty;
        let currentWorldMatrix = parentWorldMatrix;

        if (isWorldDirty) {
          const lm = node.localMatrix;
          if (node.isDirty) {
            const rot = node.rotation;
            const sx = node.skewX;
            const sy = node.skewY;
            if (!rot && !sx && !sy) {
              lm[0] = node.scaleX; lm[1] = 0; lm[2] = 0;
              lm[3] = 0; lm[4] = node.scaleY; lm[5] = 0;
              lm[6] = node.x; lm[7] = node.y; lm[8] = 1;
            } else {
              getTransformMatrix(
                lm,
                node.x, node.y, 
                rot || 0, 
                node.scaleX, node.scaleY,
                sx || 0, sy || 0
              );
            }
            node.isDirty = false;
          }
          const wm = node.worldMatrix;
          const a00 = parentWorldMatrix[0], a01 = parentWorldMatrix[1], a10 = parentWorldMatrix[3], a11 = parentWorldMatrix[4], a20 = parentWorldMatrix[6], a21 = parentWorldMatrix[7];
          if (a00 === 1 && a01 === 0 && a10 === 0 && a11 === 1 && a20 === 0 && a21 === 0) {
            wm[0] = lm[0]; wm[1] = lm[1]; wm[2] = 0;
            wm[3] = lm[3]; wm[4] = lm[4]; wm[5] = 0;
            wm[6] = lm[6]; wm[7] = lm[7]; wm[8] = 1;
          } else {
            const b00 = lm[0], b01 = lm[1], b10 = lm[3], b11 = lm[4], b20 = lm[6], b21 = lm[7];
            wm[0] = b00 * a00 + b01 * a10;
            wm[1] = b00 * a01 + b01 * a11;
            wm[2] = 0;
            wm[3] = b10 * a00 + b11 * a10;
            wm[4] = b10 * a01 + b11 * a11;
            wm[5] = 0;
            wm[6] = b20 * a00 + b21 * a10 + a20;
            wm[7] = b20 * a01 + b21 * a11 + a21;
            wm[8] = 1;
          }
          currentWorldMatrix = wm;
        } else {
          currentWorldMatrix = node.worldMatrix;
        }

        const childrenNodes = node.childrenNodes;
        if (childrenNodes && childrenNodes.length > 0) {
          const len = childrenNodes.length;
          const a00 = currentWorldMatrix[0], a01 = currentWorldMatrix[1], a10 = currentWorldMatrix[3], a11 = currentWorldMatrix[4], a20 = currentWorldMatrix[6], a21 = currentWorldMatrix[7];
          const isParentIdentity = a00 === 1 && a01 === 0 && a10 === 0 && a11 === 1 && a20 === 0 && a21 === 0;

          for (let i = 0; i < len; i++) {
            const child = childrenNodes[i];
            const hasChildren = (child.childrenNodes && child.childrenNodes.length > 0) || (child.children && child.children.length > 0);
            if (hasChildren) {
              traverse(child, currentWorldMatrix, isWorldDirty);
            } else {
              const isChildDirty = child.isDirty || isWorldDirty;
              if (isChildDirty) {
                const lm = child.localMatrix;
                if (child.isDirty) {
                  const rot = child.rotation;
                  const sx = child.skewX;
                  const sy = child.skewY;
                  if (!rot && !sx && !sy) {
                    lm[0] = child.scaleX; lm[1] = 0; lm[2] = 0;
                    lm[3] = 0; lm[4] = child.scaleY; lm[5] = 0;
                    lm[6] = child.x; lm[7] = child.y; lm[8] = 1;
                  } else {
                    getTransformMatrix(
                      lm,
                      child.x, child.y, 
                      rot || 0, 
                      child.scaleX, child.scaleY,
                      sx || 0, sy || 0
                    );
                  }
                  child.isDirty = false;
                }
                const wm = child.worldMatrix;
                if (isParentIdentity) {
                  wm[0] = lm[0]; wm[1] = lm[1]; wm[2] = 0;
                  wm[3] = lm[3]; wm[4] = lm[4]; wm[5] = 0;
                  wm[6] = lm[6]; wm[7] = lm[7]; wm[8] = 1;
                } else {
                  const b00 = lm[0], b01 = lm[1], b10 = lm[3], b11 = lm[4], b20 = lm[6], b21 = lm[7];
                  wm[0] = b00 * a00 + b01 * a10;
                  wm[1] = b00 * a01 + b01 * a11;
                  wm[2] = 0;
                  wm[3] = b10 * a00 + b11 * a10;
                  wm[4] = b10 * a01 + b11 * a11;
                  wm[5] = 0;
                  wm[6] = b20 * a00 + b21 * a10 + a20;
                  wm[7] = b20 * a01 + b21 * a11 + a21;
                  wm[8] = 1;
                }
              }
            }
          }
        } else {
          const children = node.children && node.children.length > 0 ? node.children : getChildren(node.id, node);
          const len = children.length;
          for (let i = 0; i < len; i++) {
            const childNode = nodes[children[i]];
            if (childNode) {
              traverse(childNode, currentWorldMatrix, isWorldDirty);
            }
          }
        }
      };

      traverse(nodes[rootId], createMatrix(), false);

      return { nodes };
    });
  }
  });
  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
