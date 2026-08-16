import { StateCreator } from 'zustand/vanilla';
import { SceneGraphState } from './store';

export type SyncMessage = {
  type: string;
  payload: any;
};

export interface SyncMiddleware {
  isRemote: boolean;
  broadcast: (msg: SyncMessage) => void;
  applyRemote: (msg: SyncMessage) => void;
}

export const syncMiddleware = (
  config: StateCreator<SceneGraphState, [], []>,
  broadcastCb: (msg: SyncMessage) => void
): StateCreator<SceneGraphState, [], []> => (set, get, api) => {
  const wrappedSet = (partial: any, replace?: boolean, action?: any) => {
    const isRemote = (api as any).__isRemote;
    set(partial, replace);
    
    if (!isRemote && action) {
      broadcastCb(action);
    }
  };

  (api as any).applyRemote = (msg: SyncMessage) => {
    (api as any).__isRemote = true;
    const state = get();
    if (msg.type === 'addNode') {
      state.addNode(msg.payload);
    } else if (msg.type === 'updateNode') {
      state.updateNode(msg.payload.id, msg.payload.updates);
    } else if (msg.type === 'reorderNode') {
      state.reorderNode(msg.payload.id, msg.payload.newParentId, msg.payload.index);
    }
    (api as any).__isRemote = false;
  };

  return config(wrappedSet as any, get, api);
};
