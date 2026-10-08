import type { StateCreator } from "zustand/vanilla";
import type { SceneGraphState } from "./store.js";

export type SyncMessage = {
  type: string;
  // biome-ignore lint/suspicious/noExplicitAny: required by SyncMessage type definition
  payload: any;
};

export interface SyncMiddleware {
  isRemote: boolean;
  broadcast: (msg: SyncMessage) => void;
  applyRemote: (msg: SyncMessage) => void;
}

export const syncMiddleware =
  (
    config: StateCreator<SceneGraphState, [], []>,
    broadcastCb: (msg: SyncMessage) => void,
  ): StateCreator<SceneGraphState, [], []> =>
  (set, get, api) => {
    const wrappedSet = (
      partial: unknown,
      replace?: boolean,
      action?: unknown,
    ) => {
      const isRemote = (api as unknown as { __isRemote?: boolean }).__isRemote;
      set(partial as Parameters<typeof set>[0], replace);

      if (!isRemote && action) {
        broadcastCb(action as SyncMessage);
      }
    };

    (
      api as unknown as { applyRemote: (msg: SyncMessage) => void }
    ).applyRemote = (msg: SyncMessage) => {
      (api as unknown as { __isRemote: boolean }).__isRemote = true;
      const state = get();
      if (msg.type === "addNode") {
        state.addNode(msg.payload);
      } else if (msg.type === "updateNode") {
        const payload = msg.payload;
        state.updateNode(payload.id, payload.updates);
      } else if (msg.type === "reorderNode") {
        const payload = msg.payload;
        state.reorderNode(payload.id, payload.newParentId, payload.index);
      }
      (api as unknown as { __isRemote: boolean }).__isRemote = false;
    };

    return config(
      wrappedSet as unknown as Parameters<typeof config>[0],
      get,
      api,
    );
  };
