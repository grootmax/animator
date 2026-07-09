import { createStore } from 'zustand/vanilla';
import { Matrix3, createMatrix, getTransformMatrix, multiplyMatrix } from '@monorepo/math';

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
  localMatrix: Matrix3;
  worldMatrix: Matrix3;
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
  executeTransaction: (fn: () => void) => void;
  createGroup: (groupId: string, childIds: string[], parentId: string | null, index: number) => void;
  reparentNodes: (ids: string[], newParentId: string | null, startIndex: number) => void;
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
  ...node,
  localMatrix: createMatrix(),
  worldMatrix: createMatrix(),
  isDirty: true
});

export const createSceneGraphStore = () => {
  let isBatching = false;
  let batchState: any = null;

  return createStore<SceneGraphState>((set, get) => {
    const originalSet = set;
    const originalGet = get;

    const customSet = (partial: any, replace?: boolean) => {
      if (isBatching) {
        const nextState = typeof partial === 'function' ? partial(batchState || originalGet()) : partial;
        batchState = { ...(batchState || originalGet()), ...nextState };
      } else {
        originalSet(partial, replace);
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

      addNode: (node) => {
        customSet((state: SceneGraphState) => {
          const newNode = getDefaultNode(node);
          const newNodes = { ...state.nodes, [node.id]: newNode };

          if (node.parentId) {
            const parent = newNodes[node.parentId];
            if (parent) {
              newNodes[node.parentId] = {
                ...parent,
                children: [...parent.children, node.id]
              };
            }
          }

          return {
            nodes: newNodes,
            rootId: state.rootId || (newNode.parentId === null ? node.id : state.rootId)
          };
        });
      },

      updateNode: (id, updates) => {
        customSet((state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;

          const newNodes = { ...state.nodes, [id]: { ...node, ...updates, isDirty: true } };

          return { nodes: newNodes };
        });
      },

      reorderNode: (id, newParentId, index) => {
        customSet((state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;

          const newNodes = { ...state.nodes };

          // Remove from old parent
          if (node.parentId && newNodes[node.parentId]) {
            const parent = newNodes[node.parentId];
            newNodes[node.parentId] = {
              ...parent,
              children: parent.children.filter(childId => childId !== id)
            };
          }

          // Add to new parent
          if (newParentId && newNodes[newParentId]) {
            const newParent = newNodes[newParentId];
            const newChildren = [...newParent.children];
            newChildren.splice(index, 0, id);
            newNodes[newParentId] = {
              ...newParent,
              children: newChildren
            };
          }

          newNodes[id] = { ...node, parentId: newParentId, isDirty: true };

          return { nodes: newNodes };
        });
      },

      markDirty: (id) => {
        customSet((state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;

          const newNodes = { ...state.nodes, [id]: { ...node, isDirty: true } };

          return { nodes: newNodes };
        });
      },

      recalculateMatrices: () => {
        customSet((state: SceneGraphState) => {
          const newNodes = { ...state.nodes };
          const { rootId } = state;

          if (!rootId || !newNodes[rootId]) return state;

          const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
            const node = newNodes[nodeId];
            if (!node) return;

            const isNowDirty = node.isDirty || parentWasDirty;
            let currentWorldMatrix = parentWorldMatrix;

            if (isNowDirty) {
              const localMatrix = getTransformMatrix(
                node.x, node.y, 
                node.rotation, 
                node.scaleX, node.scaleY,
                node.skewX || 0, node.skewY || 0
              );
              currentWorldMatrix = multiplyMatrix(parentWorldMatrix, localMatrix);

              newNodes[nodeId] = {
                ...node,
                localMatrix,
                worldMatrix: currentWorldMatrix,
                isDirty: false
              };
            } else {
                currentWorldMatrix = node.worldMatrix;
            }

            for (const childId of node.children) {
              traverse(childId, currentWorldMatrix, isNowDirty);
            }
          };

          traverse(rootId, createMatrix(), false);

          return { nodes: newNodes };
        });
      },

      executeTransaction: (fn) => {
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

      createGroup: (groupId, childIds, parentId, index) => {
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

      reparentNodes: (ids, newParentId, startIndex) => {
        customGet().executeTransaction(() => {
          ids.forEach((id, idx) => {
            customGet().reorderNode(id, newParentId, startIndex + idx);
          });
        });
      }
    };
  });
};
