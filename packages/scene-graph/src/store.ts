import { type StoreApi, createStore } from "zustand/vanilla";
import { type SyncMessage, syncMiddleware } from "./sync.js";

export type NodeType = "path" | "group" | "image" | "rect";

export interface SceneNode {
  id: string;
  type: NodeType;
  parentId?: string | null;
  order?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  fill?: string;
  [key: string]: unknown;
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  rootId: string | null;
  addNode: (
    node: Partial<
      Omit<SceneNode, "localMatrix" | "worldMatrix" | "isDirty">
    > & { id: string; type: NodeType },
  ) => void;
  updateNode: (
    id: string,
    updates: Partial<
      Omit<
        SceneNode,
        | "id"
        | "type"
        | "parentId"
        | "order"
        | "localMatrix"
        | "worldMatrix"
        | "isDirty"
      >
    >,
  ) => void;
  reorderNode: (id: string, newParentId: string | null, index: number) => void;
  [key: string]: unknown;
}

export type SceneGraphStore = StoreApi<SceneGraphState> & {
  applyRemote?: (msg: SyncMessage) => void;
};

export const createSceneGraphStore = (
  broadcastCb?: (msg: SyncMessage) => void,
): SceneGraphStore => {
  const cb = broadcastCb || (() => {});
  const config = (
    set: (
      fn: (state: SceneGraphState) => Partial<SceneGraphState>,
      replace?: boolean,
      action?: SyncMessage,
    ) => void,
    _get: unknown,
    _api: unknown,
  ): SceneGraphState => ({
    nodes: {},
    rootId: null,
    addNode: (node) => {
      set(
        (state: SceneGraphState) => {
          const newNode: SceneNode = {
            parentId: null,
            ...node,
          };
          const newNodes = { ...state.nodes, [node.id]: newNode };
          return {
            nodes: newNodes,
            rootId:
              state.rootId ||
              (node.parentId === null || node.parentId === undefined
                ? node.id
                : state.rootId),
          };
        },
        false,
        { type: "addNode", payload: node },
      );
    },
    updateNode: (id, updates) => {
      set(
        (state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;
          const newNodes = { ...state.nodes, [id]: { ...node, ...updates } };
          return { nodes: newNodes };
        },
        false,
        { type: "updateNode", payload: { id, updates } },
      );
    },
    reorderNode: (id, newParentId, _index) => {
      set(
        (state: SceneGraphState) => {
          const node = state.nodes[id];
          if (!node) return state;
          const newNodes = {
            ...state.nodes,
            [id]: { ...node, parentId: newParentId },
          };
          return { nodes: newNodes };
        },
        false,
        { type: "reorderNode", payload: { id, newParentId, index: _index } },
      );
    },
  });

  return createStore<SceneGraphState>(
    syncMiddleware(
      config as unknown as Parameters<typeof syncMiddleware>[0],
      cb,
    ),
  ) as SceneGraphStore;
};
