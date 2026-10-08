import type { StateCreator } from "zustand/vanilla";
import type { SceneGraphState } from "./store";

export type SyncMessage = {
  type: string;
  // biome-ignore lint/suspicious/noExplicitAny: payload structure varies by message type
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
    // biome-ignore lint/suspicious/noExplicitAny: zustand store action parameter
    const wrappedSet = (partial: unknown, replace?: boolean, action?: any) => {
      // biome-ignore lint/suspicious/noExplicitAny: custom internal property
      const isRemote = (api as any).__isRemote;
      set(partial as Partial<SceneGraphState>, replace);

      if (!isRemote && action) {
        broadcastCb(action);
      }
    };

    // biome-ignore lint/suspicious/noExplicitAny: custom internal property
    (api as any).applyRemote = (msg: SyncMessage) => {
      // biome-ignore lint/suspicious/noExplicitAny: custom internal property
      (api as any).__isRemote = true;
      const state = get();
      if (msg.type === "addNode") {
        state.addNode(msg.payload);
      } else if (msg.type === "updateNode") {
        state.updateNode(msg.payload.id, msg.payload.updates);
      } else if (msg.type === "reorderNode") {
        state.reorderNode(
          msg.payload.id,
          msg.payload.newParentId,
          msg.payload.index,
        );
      }
      // biome-ignore lint/suspicious/noExplicitAny: custom internal property
      (api as any).__isRemote = false;
    };

    // biome-ignore lint/suspicious/noExplicitAny: zustand middleware wrapper
    return config(wrappedSet as any, get, api);
  };
