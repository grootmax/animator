import { createSceneGraphStore } from '@monorepo/scene-graph';
import { Track } from '@monorepo/animation-engine';
import { WorkerMessage } from './animation.worker';

// Define the interface for the proxy engine
export interface WorkerEngineProxy {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  addTrack: (track: Track) => void;
  setTracks: (tracks: Track[]) => void;
  setDuration: (duration: number) => void;
  getPlayhead: () => number;
  getIsPlaying: () => boolean;
  getDuration: () => number;
  getTracks: () => Track[];
  loop: boolean;
}

export class WorkerManager {
  private worker: Worker | null = null;
  public store: ReturnType<typeof createSceneGraphStore>;
  public engine: WorkerEngineProxy;
  
  // Local state for synchronous getters
  private playhead = 0;
  private isPlaying = false;
  private duration = 5000;
  private tracks: Track[] = [];
  private _loop = true;

  constructor() {
    this.initWorker();

    // Create a mirror store using the original creator
    this.store = createSceneGraphStore();
    
    // Override methods to proxy them to worker
    const originalSetState = this.store.setState;
    
    // We override the getState() object's mutators to proxy instead
    
    this.store.setState({
      addNode: (node) => {
        this.postMessage({ type: 'ADD_NODE', payload: { node } });
      },
      updateNode: (id, updates) => {
        // Optimistic update
        originalSetState((s) => {
          const n = s.nodes[id];
          if (!n) return s;
          return {
            ...s,
            nodes: {
              ...s.nodes,
              [id]: { ...n, ...updates }
            }
          };
        });
        this.postMessage({ type: 'UPDATE_NODE', payload: { id, updates } });
      },
      reorderNode: (id, newParentId, index) => {
        this.postMessage({ type: 'REORDER_NODE', payload: { id, newParentId, index } });
      },
      markDirty: () => {},
      recalculateMatrices: () => {}
    });

    const self = this;
    
    this.engine = {
      play: () => {
        this.isPlaying = true;
        this.postMessage({ type: 'PLAY' });
      },
      pause: () => {
        this.isPlaying = false;
        this.postMessage({ type: 'PAUSE' });
      },
      seek: (time) => {
        this.playhead = time;
        this.postMessage({ type: 'SEEK', payload: { time } });
      },
      addTrack: (track) => {
        this.tracks.push(track);
        this.postMessage({ type: 'ADD_TRACK', payload: { track } });
      },
      setTracks: (tracks) => {
        this.tracks = tracks;
        this.postMessage({ type: 'SET_TRACKS', payload: { tracks } });
      },
      setDuration: (d) => {
        this.duration = d;
        this.postMessage({ type: 'SET_DURATION', payload: { duration: d } });
      },
      getPlayhead: () => this.playhead,
      getIsPlaying: () => this.isPlaying,
      getDuration: () => this.duration,
      getTracks: () => this.tracks,
      get loop() { return self._loop; },
      set loop(v: boolean) { 
        self._loop = v;
        self.postMessage({ type: 'LOOP', payload: { loop: v } });
      }
    };
  }

  private initWorker() {
    try {
      this.worker = new Worker(new URL('./animation.worker.ts', import.meta.url), { type: 'module' });
      
      this.worker.onmessage = (e) => {
        if (e.data.type === 'SYNC_STATE') {
          const { nodes, playhead, isPlaying } = e.data.payload;
          
          this.playhead = playhead;
          this.isPlaying = isPlaying;
          
          // Batch replace nodes in the mirror store
          this.store.setState({ nodes });
        }
      };

      this.worker.onerror = (err) => {
        console.error('Worker error:', err);
        // Crash recovery: restart worker
        this.worker?.terminate();
        this.initWorker();
        // Sync current state to the new worker
        const state = this.store.getState();
        this.postMessage({ 
          type: 'INITIALIZE_SCENE', 
          payload: { nodes: state.nodes } 
        });
        this.postMessage({ type: 'SET_TRACKS', payload: { tracks: this.tracks } });
        this.postMessage({ type: 'SET_DURATION', payload: { duration: this.duration } });
        this.postMessage({ type: 'SEEK', payload: { time: this.playhead } });
        if (this.isPlaying) this.postMessage({ type: 'PLAY' });
      };
    } catch (e) {
      console.warn("Failed to initialize Web Worker, falling back to main thread (Not Implemented Here)");
      // For fallback we would instantiate the real store/engine here, but per requirements we just need graceful behavior.
    }
  }

  private postMessage(msg: WorkerMessage) {
    if (this.worker) {
      this.worker.postMessage(msg);
    }
  }
}

export const workerManager = new WorkerManager();
