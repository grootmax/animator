import { AnimationEngine } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

// The worker's isolated store
const store = createSceneGraphStore();
const engine = new AnimationEngine(store);

// Shim requestAnimationFrame and performance.now if needed in Web Worker
const _self = self as any;
if (!_self.requestAnimationFrame) {
  _self.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 1000 / 60);
  _self.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// We need to sync back to the main thread whenever the store updates
let isMainThreadSync = false;
let pendingSync = false;

store.subscribe(() => {
  if (isMainThreadSync) return;
  if (pendingSync) return;
  pendingSync = true;
  
  // Batch sync to main thread using setTimeout
  setTimeout(() => {
    pendingSync = false;
    _self.postMessage({
      type: 'SYNC_NODES',
      nodes: store.getState().nodes
    });
  }, 0);
});

// Periodically sync engine state if playing
setInterval(() => {
  if (engine.getIsPlaying()) {
    _self.postMessage({
      type: 'SYNC_ENGINE_STATE',
      state: {
        playhead: engine.getPlayhead(),
        isPlaying: engine.getIsPlaying(),
        duration: engine.getDuration(),
        tracks: engine.getTracks()
      }
    });
  }
}, 1000 / 30); // 30fps state sync is enough for UI timeline

_self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'SYNC_FROM_MAIN':
      isMainThreadSync = true;
      // Completely replace local nodes with main thread nodes to maintain SOT
      // We assume payload is the nodes record.
      // However, we don't have a replace method, so we use setState.
      store.setState({ nodes: payload, rootId: store.getState().rootId || Object.keys(payload)[0] });
      isMainThreadSync = false;
      break;

    case 'PLAY':
      engine.play();
      syncState();
      break;

    case 'PAUSE':
      engine.pause();
      syncState();
      break;

    case 'SEEK':
      engine.seek(payload);
      syncState();
      break;

    case 'ADD_TRACK':
      engine.addTrack(payload);
      syncState();
      break;

    case 'SET_TRACKS':
      engine.setTracks(payload);
      syncState();
      break;
      
    case 'SET_DURATION':
      engine.setDuration(payload);
      syncState();
      break;
      
    case 'GET_STATE':
      syncState();
      break;
  }
};

function syncState() {
  _self.postMessage({
    type: 'SYNC_ENGINE_STATE',
    state: {
      playhead: engine.getPlayhead(),
      isPlaying: engine.getIsPlaying(),
      duration: engine.getDuration(),
      tracks: engine.getTracks()
    }
  });
}
