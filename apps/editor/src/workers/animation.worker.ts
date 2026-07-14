import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine } from '@monorepo/animation-engine';
import { PixiBridge } from '@monorepo/renderer';

let store: ReturnType<typeof createSceneGraphStore>;
let engine: AnimationEngine;
let bridge: PixiBridge;
let eventBus: EventTarget;
let lastPlayhead = -1;

self.onmessage = (e) => {
  const { type, payload } = e.data;
  
  if (type === 'INIT') {
    store = createSceneGraphStore();
    engine = new AnimationEngine(store);

    if (payload.nodes) {
        store.setState({ nodes: payload.nodes });
        store.getState().recalculateMatrices();
    }
    
    bridge = new PixiBridge({
      canvas: payload.canvas,
      store,
      width: payload.width,
      height: payload.height,
      resolution: payload.resolution
    });

    eventBus = bridge.eventBus;
    
    const ticker = () => {
      const isPlaying = engine.getIsPlaying();
      if (isPlaying) {
        const p = engine.getPlayhead();
        if (p !== lastPlayhead) {
          const state = store.getState().nodes;
          const mutated: Record<string, any> = {};
          const tracks = engine.getTracks();
          for (let i = 0; i < tracks.length; i++) {
             const track = tracks[i];
             if (state[track.nodeId]) {
                 mutated[track.nodeId] = state[track.nodeId];
             }
          }
          self.postMessage({ type: 'PLAYHEAD_UPDATE', playhead: p, isPlaying: true, mutatedNodes: mutated });
          lastPlayhead = p;
        }
      }
      requestAnimationFrame(ticker);
    };
    requestAnimationFrame(ticker);
  }
  else if (type === 'SYNC_SCENE') {
    store.setState({ nodes: payload.nodes });
    store.getState().recalculateMatrices();
  }
  else if (type === 'SYNC_TRACKS') {
    engine.setTracks(payload.tracks);
  }
  else if (type === 'PLAY') {
    engine.play();
    self.postMessage({ type: 'PLAYHEAD_UPDATE', playhead: engine.getPlayhead(), isPlaying: true });
  }
  else if (type === 'PAUSE') {
    engine.pause();
    self.postMessage({ type: 'PLAYHEAD_UPDATE', playhead: engine.getPlayhead(), isPlaying: false });
  }
  else if (type === 'SEEK') {
    engine.seek(payload.time);
    const state = store.getState().nodes;
    const mutated: Record<string, any> = {};
    const tracks = engine.getTracks();
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (state[track.nodeId]) {
            mutated[track.nodeId] = state[track.nodeId];
        }
    }
    self.postMessage({ type: 'PLAYHEAD_UPDATE', playhead: engine.getPlayhead(), isPlaying: engine.getIsPlaying(), mutatedNodes: mutated });
  }
  else if (type === 'POINTER_EVENT') {
    if (!eventBus) return;
    
    const ev = new Event(payload.eventName) as any;
    ev.clientX = payload.clientX;
    ev.clientY = payload.clientY;
    ev.button = payload.button;
    ev.shiftKey = payload.shiftKey;
    if (payload.eventName === 'wheel') {
        ev.deltaY = payload.deltaY;
        ev.preventDefault = () => {};
    }
    if (payload.eventName.startsWith('pointer')) {
        ev.globalX = payload.clientX;
        ev.globalY = payload.clientY;
    }
    eventBus.dispatchEvent(ev);
    
    // Dispatch to PixiJS interactive events directly on the canvas
    if (bridge && bridge.app && bridge.app.view) {
      const syntheticEvent = new Event(payload.eventName) as any;
      syntheticEvent.clientX = payload.clientX;
      syntheticEvent.clientY = payload.clientY;
      syntheticEvent.button = payload.button;
      syntheticEvent.shiftKey = payload.shiftKey;
      syntheticEvent.pointerId = 1;
      syntheticEvent.pointerType = 'mouse';
      syntheticEvent.isPrimary = true;
      (bridge.app.view as any).dispatchEvent(syntheticEvent);
    }
  }
  else if (type === 'RESIZE') {
    if (bridge && bridge.app) {
      bridge.app.renderer.resize(payload.width, payload.height);
    }
  }
};
