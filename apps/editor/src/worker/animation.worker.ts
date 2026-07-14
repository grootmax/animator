import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

// Define message types
export type WorkerMessage =
  | { type: 'INITIALIZE_SCENE'; payload: { nodes: Record<string, any> } }
  | { type: 'ADD_NODE'; payload: { node: any } }
  | { type: 'UPDATE_NODE'; payload: { id: string; updates: any } }
  | { type: 'REORDER_NODE'; payload: { id: string; newParentId: string | null; index: number } }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; payload: { time: number } }
  | { type: 'ADD_TRACK'; payload: { track: Track } }
  | { type: 'SET_TRACKS'; payload: { tracks: Track[] } }
  | { type: 'SET_DURATION'; payload: { duration: number } }
  | { type: 'LOOP'; payload: { loop: boolean } };

const store = createSceneGraphStore();
const engine = new AnimationEngine(store);

// We need to override the tick or intercept updates to send SYNC_STATE
// But AnimationEngine already has a tick using requestAnimationFrame.
// Since we are in a worker context, requestAnimationFrame might not be available
// depending on the environment, but modern browsers support self.requestAnimationFrame in workers if it's a dedicated worker.
// Let's use it, or fallback to setTimeout.
const requestAnimFrame = typeof self.requestAnimationFrame === 'function'
  ? self.requestAnimationFrame
  : (cb: FrameRequestCallback) => setTimeout(cb, 1000 / 60);

// Wait, @monorepo/animation-engine uses `requestAnimationFrame` which might be undefined in old worker contexts,
// However, instead of monkey-patching, let's subscribe to the store, but store.subscribe is not standard vanilla zustand unless imported.
// Wait, createStore from zustand/vanilla returns an object with `subscribe`.
// We can subscribe to the store and batch send the state, or we can just send it on RAF tick.

let syncQueued = false;

function queueSync() {
  if (!syncQueued) {
    syncQueued = true;
    requestAnimFrame(() => {
      syncQueued = false;
      const state = store.getState();
      self.postMessage({
        type: 'SYNC_STATE',
        payload: {
          nodes: state.nodes,
          playhead: engine.getPlayhead(),
          isPlaying: engine.getIsPlaying(),
        }
      });
    });
  }
}

// Subscribe to store changes to sync updates to the UI
store.subscribe(() => {
  queueSync();
});

// Since the engine uses requestAnimationFrame, we need to ensure it uses the worker's requestAnimationFrame.
// Wait, @monorepo/animation-engine uses `requestAnimationFrame` which might be undefined in old worker contexts,
// but in modern Vite/Rollup it resolves to globalThis.requestAnimationFrame. 
// Just in case, we can provide it:
if (typeof self.requestAnimationFrame === 'undefined') {
  (self as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 1000 / 60);
  (self as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;
  
  switch (type) {
    case 'INITIALIZE_SCENE': {
      const { nodes } = (event.data as any).payload;
      // Replace all nodes in store
      // Since zustand doesn't have a replace method, we just use setState directly
      store.setState({ nodes, rootId: null });
      queueSync();
      break;
    }
    case 'ADD_NODE': {
      const { node } = (event.data as any).payload;
      store.getState().addNode(node);
      // Wait, addNode is on getState().
      break;
    }
    case 'UPDATE_NODE': {
      const { id, updates } = (event.data as any).payload;
      store.getState().updateNode(id, updates);
      break;
    }
    case 'REORDER_NODE': {
      const { id, newParentId, index } = (event.data as any).payload;
      store.getState().reorderNode(id, newParentId, index);
      break;
    }
    case 'PLAY': {
      engine.play();
      queueSync();
      break;
    }
    case 'PAUSE': {
      engine.pause();
      queueSync();
      break;
    }
    case 'SEEK': {
      const { time } = (event.data as any).payload;
      engine.seek(time);
      queueSync();
      break;
    }
    case 'ADD_TRACK': {
      const { track } = (event.data as any).payload;
      engine.addTrack(track);
      break;
    }
    case 'SET_TRACKS': {
      const { tracks } = (event.data as any).payload;
      engine.setTracks(tracks);
      break;
    }
    case 'SET_DURATION': {
      const { duration } = (event.data as any).payload;
      engine.setDuration(duration);
      break;
    }
    case 'LOOP': {
      const { loop } = (event.data as any).payload;
      engine.loop = loop;
      break;
    }
  }
};
