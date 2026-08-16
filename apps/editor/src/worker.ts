import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';

const store = createSceneGraphStore();
const engine = new AnimationEngine(store);
let bridge: PixiBridge | null = null;

// Periodically send state to main thread for UI sync (LayerPanel needs this)
let lastUiSync = 0;
const uiSyncInterval = 32; // ~30fps for UI updates

store.subscribe((state) => {
    const now = performance.now();
    if (now - lastUiSync > uiSyncInterval) {
        lastUiSync = now;
        self.postMessage({ 
            type: 'state-sync', 
            nodes: state.nodes, 
            isPlaying: engine.getIsPlaying(),
            playhead: engine.getPlayhead() 
        });
    }
});

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'init':
            const { canvas, width, height, pixelRatio } = payload;
            bridge = new PixiBridge(canvas, store, width, height, pixelRatio);
            break;
            
        case 'resize':
            if (bridge) {
                bridge.resize(payload.width, payload.height);
            }
            break;
            
        case 'event':
            if (bridge) {
                bridge.handleEvent(payload.eventType, payload.eventData);
            }
            break;
            
        case 'ui-update':
            // Fast delta updates from UI to worker store
            store.setState((state) => {
                const nodes = { ...state.nodes };
                for (const [id, updates] of Object.entries(payload.nodes)) {
                    if (nodes[id]) {
                        nodes[id] = { ...nodes[id], ...(updates as any) };
                        nodes[id].isDirty = true;
                    } else {
                        nodes[id] = updates as any;
                    }
                }
                return { nodes };
            });
            store.getState().recalculateMatrices();
            break;

        case 'play':
            engine.play();
            self.postMessage({ type: 'play-state', isPlaying: engine.getIsPlaying() });
            break;
            
        case 'pause':
            engine.pause();
            self.postMessage({ type: 'play-state', isPlaying: engine.getIsPlaying() });
            break;

        case 'seek':
            engine.seek(payload.time);
            self.postMessage({ type: 'play-state', playhead: engine.getPlayhead() });
            break;

        case 'add-track':
            engine.addTrack(payload.track);
            break;
            
        case 'zoom-in':
            if (bridge) {
                const eData = { deltaY: -100, clientX: payload.width / 2, clientY: payload.height / 2 };
                bridge.handleEvent('wheel', eData);
            }
            break;

        case 'zoom-out':
            if (bridge) {
                const eData = { deltaY: 100, clientX: payload.width / 2, clientY: payload.height / 2 };
                bridge.handleEvent('wheel', eData);
            }
            break;
    }
};
