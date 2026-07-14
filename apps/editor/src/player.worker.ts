import { AnimationEngine } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';

const store = createSceneGraphStore();
let engine: AnimationEngine | null = null;
let bridge: PixiBridge | null = null;
let lastSyncTime = 0;
const SYNC_INTERVAL = 1000 / 30; // Max 30 FPS sync to main thread to avoid blocking UI

self.onmessage = (e) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case 'INIT': {
        // Initialize store with nodes
        for (const [id, node] of Object.entries(msg.nodes)) {
          store.getState().addNode(node as any);
        }
        store.getState().recalculateMatrices();

        engine = new AnimationEngine(store);
        bridge = new PixiBridge(msg.canvas, store, {
          width: msg.width,
          height: msg.height,
          resolution: msg.resolution
        });

        // Intercept engine's node updates to send deltas
        const originalUpdateNodes = (engine as any).updateNodes.bind(engine);
        (engine as any).updateNodes = () => {
          // Instead of intercepting the whole function, we'll hook into store updates
          originalUpdateNodes();
        };

        // We can subscribe to the store in the worker to track deltas and send them to the main thread
        // Wait, the store subscribe fires too often or with the whole state.
        // It's better to hook the AnimationEngine's updateNodes or just send current playhead.
        
        let pendingUpdates: Record<string, any> = {};
        
        const originalUpdateNode = store.getState().updateNode;
        store.getState().updateNode = (id, updates) => {
          originalUpdateNode(id, updates);
          if (!pendingUpdates[id]) pendingUpdates[id] = {};
          Object.assign(pendingUpdates[id], updates);
        };

        // Custom ticker for syncing back to main thread
        const syncLoop = () => {
          const now = performance.now();
          if (engine && now - lastSyncTime > SYNC_INTERVAL) {
            lastSyncTime = now;
            const hasUpdates = Object.keys(pendingUpdates).length > 0;
            
            self.postMessage({
              type: 'SYNC_STATE',
              isPlaying: engine.getIsPlaying(),
              playhead: engine.getPlayhead(),
              updates: hasUpdates ? pendingUpdates : null
            });
            
            if (hasUpdates) {
              pendingUpdates = {};
            }
          }
          requestAnimationFrame(syncLoop);
        };
        requestAnimationFrame(syncLoop);
        break;
      }
      case 'SET_DURATION':
        if (engine) engine.setDuration(msg.duration);
        break;
      case 'SET_TRACKS':
        if (engine) engine.setTracks(msg.tracks);
        break;
      case 'PLAY':
        if (engine) engine.play();
        break;
      case 'PAUSE':
        if (engine) {
          engine.pause();
          // Force a sync when paused
          self.postMessage({
            type: 'SYNC_STATE',
            isPlaying: engine.getIsPlaying(),
            playhead: engine.getPlayhead()
          });
        }
        break;
      case 'SEEK':
        if (engine) {
          engine.seek(msg.time);
          // Force sync on seek
          self.postMessage({
            type: 'SYNC_STATE',
            isPlaying: engine.getIsPlaying(),
            playhead: engine.getPlayhead()
          });
        }
        break;
      case 'UPDATE_NODE': {
        const state = store.getState();
        if (state.nodes[msg.nodeId]) {
          state.updateNode(msg.nodeId, msg.updates);
          state.recalculateMatrices();
        }
        break;
      }
      case 'ZOOM_IN':
        if (bridge && bridge.viewport) {
          bridge.viewport.container.scale.x *= 1.2;
          bridge.viewport.container.scale.y *= 1.2;
          bridge.viewport.drawGrid();
        }
        break;
      case 'ZOOM_OUT':
        if (bridge && bridge.viewport) {
          bridge.viewport.container.scale.x /= 1.2;
          bridge.viewport.container.scale.y /= 1.2;
          bridge.viewport.drawGrid();
        }
        break;
    }
  } catch (err) {
    console.error('Worker Error:', err);
  }
};
