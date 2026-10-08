import type { StateCreator } from "zustand/vanilla";
import type { SceneGraphState } from "./store.js";

export type SyncMessage = {
  type: string;
  payload: unknown;
};

export interface SyncMiddleware {
  isRemote: boolean;
  broadcast: (msg: SyncMessage) => void;
  applyRemote: (msg: SyncMessage) => void;
}

export interface SyncStoreApi {
  __isRemote?: boolean;
  applyRemote?: (msg: SyncMessage) => void;
}

export const syncMiddleware =
  (
    config: StateCreator<SceneGraphState, [], []>,
    broadcastCb: (msg: SyncMessage) => void,
  ): StateCreator<SceneGraphState, [], []> =>
  (set, get, api) => {
    const syncApi = api as unknown as SyncStoreApi;

    const wrappedSet = (
      partial: unknown,
      replace?: boolean,
      action?: SyncMessage,
    ) => {
      const isRemote = syncApi.__isRemote;
      if (replace) {
        set(partial as Parameters<typeof set>[0], true);
      } else {
        set(partial as Parameters<typeof set>[0]);
      }

      if (!isRemote && action) {
        broadcastCb(action);
      }
    };

    syncApi.applyRemote = (msg: SyncMessage) => {
      syncApi.__isRemote = true;
      const state = get();
      if (msg.type === "addNode") {
        state.addNode(msg.payload as Parameters<typeof state.addNode>[0]);
      } else if (msg.type === "updateNode") {
        const payload = msg.payload as {
          id: string;
          updates: Parameters<typeof state.updateNode>[1];
        };
        state.updateNode(payload.id, payload.updates);
      } else if (msg.type === "reorderNode") {
        const payload = msg.payload as {
          id: string;
          newParentId: string | null;
          index: number;
        };
        state.reorderNode(payload.id, payload.newParentId, payload.index);
      }
      syncApi.__isRemote = false;
    };

    return config(
      wrappedSet as unknown as Parameters<typeof config>[0],
      get,
      api,
    );
  };
