import { generateKeyBetween } from '@monorepo/math';
import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix, copyMatrix } from '@monorepo/math';
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
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  markDirty: (id: string) => void;
  recalculateMatrices: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => void;
  executeTransaction: (fn: () => void) => void;
  createGroup: (groupId: string, childIds: string[], parentId: string | null, index: number) => void;
  reparentNodes: (ids: string[], newParentId: string | null, startIndex: number) => void;
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

const compareOrder = (aOrder: string = '', bOrder: string = ''): number => {
  if (aOrder < bOrder) return -1;
  if (aOrder > bOrder) return 1;
  return 0;
};

export const createSceneGraphStore = (broadcastCb?: (msg: SyncMessage) => void) => {
  let isBatching = false;
  let batchState: any = null;

  const config = (set: any, get: any) => {
    const originalSet = set;
    const originalGet = get;

    const customSet = (partial: any, replace?: boolean, action?: any) => {
      if (isBatching) {
        const currentState = batchState || originalGet();
        const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
        batchState = { ...currentState, ...nextPartial };
      } else {
        originalSet(partial, replace, action);
      }
    };

    const customGet = () => {
      if (isBatching && batchState) {
        return batchState;
      }
      return originalGet();
    };

    return {
      nodes: {},
      rootId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeId: null,
      remoteSelections: {},

      setViewport: (viewport: { x: number; y: number; zoom: number }) => customSet({ viewport }),

      setSelectedNodeId: (selectedNodeId: string | null) => customSet({ selectedNodeId }),

      setRemoteSelection: (userId: string, nodeId: string | null, color?: string, userName?: string) => customSet((state: SceneGraphState) => {
        const newRemoteSelections = { ...state.remoteSelections };
        if (nodeId === null) {
          delete newRemoteSelections[userId];
        } else {
          newRemoteSelections[userId] = { nodeId, color: color || '#ff0000', userName };
        }
        return { remoteSelections: newRemoteSelections };
      }),

      addNode: (node: Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }) => {
        customSet((state: SceneGraphState) => {
          const newNode = getDefaultNode(node);

          const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === (node.parentId || null));
          siblings.sort((a: any, b: any) => compareOrder(a.order, b.order));
          const lastSibling = siblings[siblings.length - 1];
          newNode.order = generateKeyBetween(lastSibling?.order || null, null);

          const newNodes = { ...state.nodes, [node.id]: newNode };

          return {
            nodes: newNodes,
            rootId: state.rootId || (newNode.parentId === null ? node.id : state.rootId)
          };
        }, false, { type: 'addNode', payload: node });
      },

      addNodesBulk: (nodesToAdd: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }>) => {
        customSet((state: SceneGraphState) => {
          const newNodes = { ...state.nodes };
          let newRootId = state.rootId;
          const lastOrderMap: Record<string, string | null> = {};

          for (const node of nodesToAdd) {
            const newNode = getDefaultNode(node);
            const pKey = node.parentId || 'root';

            if (!(pKey in lastOrderMap)) {
              const siblings = Object.values(newNodes).filter((n: SceneNode) => n.parentId === (node.parentId || null));
              siblings.sort((a: SceneNode, b: SceneNode) => compareOrder(a.order, b.order));
              lastOrderMap[pKey] = siblings.length > 0 ? siblings[siblings.length - 1].order : null;
            }

            const newOrder = generateKeyBetween(lastOrderMap[pKey], null);
            newNode.order = newOrder;
            lastOrderMap[pKey] = newOrder;

            newNodes[node.id] = newNode;

            if (newNode.parentId === null && !newRootId) {
              newRootId = node.id;
            }
          }

          return {
            nodes: newNodes,
            rootId: newRootId
          };
        });
      },

      updateNode: (id: string, updates: Partial<Omit<SceneNode, 'id' | 'type' | 'parentId' | 'order' | 'localMatrix' | 'worldMatrix' | 'isDirty'>>) => {
        customSet((state: SceneGraphState) => {
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
        customSet((state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;

          const newNodes = { ...state.nodes };

          const siblings = Object.values(state.nodes).filter((n: any) => n.parentId === newParentId && n.id !== id);
          siblings.sort((a, b) => compareOrder(a.order, b.order));

          const prev = index > 0 ? siblings[index - 1] : null;
          const next = index < siblings.length ? siblings[index] : null;

          const newOrder = generateKeyBetween(prev?.order || null, next?.order || null);

          newNodes[id] = { ...node, parentId: newParentId, order: newOrder, isDirty: true };

          return { nodes: newNodes };
        }, false, { type: 'reorderNode', payload: { id, newParentId, index } });
      },

      markDirty: (id: string) => {
        customSet((state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;

          const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };

          return { nodes: newNodes };
        });
      },

      recalculateMatrices: () => {
        customSet((state: SceneGraphState) => {
          const { nodes, rootId } = state;
          if (!rootId || !nodes[rootId]) return state;

          const childrenMap: Record<string, SceneNode[]> = {};
          const nodeList = Object.values(nodes);
          for (let i = 0; i < nodeList.length; i++) {
            const n = nodeList[i];
            const p = n.parentId;
            if (p !== null) {
              let arr = childrenMap[p];
              if (!arr) {
                arr = [];
                childrenMap[p] = arr;
              }
              arr.push(n);
            }
          }

          for (const p in childrenMap) {
            const list = childrenMap[p];
            if (list.length > 1) {
              let isSorted = true;
              for (let i = 1; i < list.length; i++) {
                if (list[i - 1].order > list[i].order) {
                  isSorted = false;
                  break;
                }
              }
              if (!isSorted) {
                list.sort((a: SceneNode, b: SceneNode) => (a.order < b.order ? -1 : 1));
              }
            }
          }

          const traverse = (node: SceneNode, parentWorldMatrix: Matrix3, parentWasDirty: boolean, isParentIdentity: boolean) => {
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
              }
              if (isParentIdentity) {
                copyMatrix(node.worldMatrix, node.localMatrix);
              } else {
                multiplyMatrix(node.worldMatrix, parentWorldMatrix, node.localMatrix);
              }
              node.isDirty = false;
              currentWorldMatrix = node.worldMatrix;
            } else {
              currentWorldMatrix = node.worldMatrix;
            }

            const children = childrenMap[node.id];
            if (children) {
              const isCurrentIdentity = currentWorldMatrix[0] === 1 && currentWorldMatrix[4] === 1 && currentWorldMatrix[8] === 1 && currentWorldMatrix[6] === 0 && currentWorldMatrix[7] === 0 && currentWorldMatrix[1] === 0 && currentWorldMatrix[3] === 0;
              for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const grandChildren = childrenMap[child.id];
                if (!grandChildren) {
                  const childDirty = child.isDirty || isWorldDirty;
                  if (childDirty) {
                    if (child.isDirty) {
                      getTransformMatrix(
                        child.localMatrix,
                        child.x, child.y,
                        child.rotation,
                        child.scaleX, child.scaleY,
                        child.skewX || 0, child.skewY || 0
                      );
                    }
                    if (isCurrentIdentity) {
                      copyMatrix(child.worldMatrix, child.localMatrix);
                    } else {
                      multiplyMatrix(child.worldMatrix, currentWorldMatrix, child.localMatrix);
                    }
                    child.isDirty = false;
                  }
                } else {
                  traverse(child, currentWorldMatrix, isWorldDirty, isCurrentIdentity);
                }
              }
            }
          };

          traverse(nodes[rootId], createMatrix(), false, true);

          return { nodes };
        });
      },

      executeTransaction: (fn: () => void) => {
        isBatching = true;
        batchState = { ...customGet() };
        try {
          fn();
          customGet().recalculateMatrices();
        } finally {
          isBatching = false;
          if (batchState) {
            const finalState = batchState;
            batchState = null;
            originalSet(finalState);
          }
        }
      },

      createGroup: (groupId: string, childIds: string[], parentId: string | null, index: number) => {
        customGet().executeTransaction(() => {
          customGet().addNode({
            id: groupId,
            type: 'group',
            name: groupId,
            parentId,
          });

          if (parentId) {
            customGet().reorderNode(groupId, parentId, index);
          }

          childIds.forEach((childId, idx) => {
            customGet().reorderNode(childId, groupId, idx);
          });
        });
      },

      reparentNodes: (ids: string[], newParentId: string | null, startIndex: number) => {
        customGet().executeTransaction(() => {
          ids.forEach((id, idx) => {
            customGet().reorderNode(id, newParentId, startIndex + idx);
          });
        });
      }
    };
  };

  return createStore<SceneGraphState>(broadcastCb ? syncMiddleware(config as any, broadcastCb) as any : config as any);
};
