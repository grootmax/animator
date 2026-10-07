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
    const msg = e.data;
    const type = msg.type;
    const payload = msg.payload || msg;

    switch (type) {
        case 'INIT':
        case 'init': {
            const { canvas } = payload;
            bridge = new PixiBridge(canvas, store);
            break;
        }
            
        case 'RESIZE':
        case 'resize': {
            if (bridge) {
                (bridge as any).resize?.(payload.width, payload.height);
            }
            break;
        }
            
        case 'DOM_EVENT':
        case 'event': {
            if (bridge) {
                const eventType = payload.eventType || payload.event?.type;
                const eventData = payload.eventData || payload.event;
                (bridge as any).handleEvent?.(eventType, eventData);
            }
            break;
        }
            
        case 'ui-update': {
            // Fast delta updates from UI to worker store
            (store as any).setState((state: any) => {
                const nodes = { ...state.nodes };
                for (const [id, updates] of Object.entries(payload.nodes || {})) {
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
        }

        case 'play': {
            engine.play();
            self.postMessage({ type: 'play-state', isPlaying: engine.getIsPlaying() });
            break;
        }
            
        case 'pause': {
            engine.pause();
            self.postMessage({ type: 'play-state', isPlaying: engine.getIsPlaying() });
            break;
        }

        case 'seek': {
            const time = payload.time !== undefined ? payload.time : msg.time;
            engine.seek(time);
            self.postMessage({ type: 'play-state', playhead: engine.getPlayhead() });
            break;
        }

        case 'add-track': {
            const track = payload.track || msg.track;
            engine.addTrack(track);
            break;
        }
            
        case 'zoom-in': {
            if (bridge) {
                const eData = { deltaY: -100, clientX: (payload.width || 800) / 2, clientY: (payload.height || 600) / 2 };
                (bridge as any).handleEvent?.('wheel', eData);
            }
            break;
        }

        case 'zoom-out': {
            if (bridge) {
                const eData = { deltaY: 100, clientX: (payload.width || 800) / 2, clientY: (payload.height || 600) / 2 };
                (bridge as any).handleEvent?.('wheel', eData);
            }
            break;
        }

        case 'ENGINE_CMD': {
            if (msg.cmd === 'play') {
                engine.play();
            } else if (msg.cmd === 'pause') {
                engine.pause();
            } else if (msg.cmd === 'seek') {
                engine.seek(msg.time);
                store.getState().recalculateMatrices();
            } else if (msg.cmd === 'addTrack') {
                engine.addTrack(msg.track);
            }
            self.postMessage({ type: 'play-state', isPlaying: engine.getIsPlaying(), playhead: engine.getPlayhead() });
            break;
        }
    }
};
