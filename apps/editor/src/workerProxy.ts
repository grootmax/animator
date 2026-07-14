import { Track } from '@monorepo/animation-engine';
import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';

export class WorkerProxy {
  private worker: Worker;
  private store: ReturnType<typeof createSceneGraphStore>;
  private isPlaying = false;
  private playhead = 0;
  private duration = 5000;
  private tracks: Track[] = [];

  constructor(store: ReturnType<typeof createSceneGraphStore>, canvas: HTMLCanvasElement) {
    this.store = store;

    // Create the worker
    this.worker = new Worker(new URL('./player.worker.ts', import.meta.url), { type: 'module' });

    // Transfer control to offscreen
    const offscreen = canvas.transferControlToOffscreen();

    // Serialize initial state to send to worker
    const nodes = JSON.parse(JSON.stringify(store.getState().nodes));

    this.worker.postMessage({
      type: 'INIT',
      canvas: offscreen,
      nodes,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      resolution: window.devicePixelRatio || 1
    }, [offscreen]);

    // Listen to main store updates and forward them to the worker
    const originalUpdateNode = store.getState().updateNode;
    store.getState().updateNode = (id, updates) => {
      originalUpdateNode(id, updates);
      
      // If we are applying an update that came FROM the worker, we shouldn't send it back
      // But we can just rely on a simple check or a flag.
      if (!(window as any).__isWorkerSync) {
         this.worker.postMessage({ type: 'UPDATE_NODE', nodeId: id, updates });
      }
    };

    // Handle messages from worker
    this.worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'SYNC_STATE':
          this.isPlaying = msg.isPlaying;
          this.playhead = msg.playhead;
          
          if (msg.updates) {
            // Apply delta updates to the store
            const state = this.store.getState();
            let requiresMatrixUpdate = false;
            (window as any).__isWorkerSync = true;
            for (const [nodeId, updates] of Object.entries(msg.updates)) {
              state.updateNode(nodeId, updates as Partial<SceneNode>);
              requiresMatrixUpdate = true;
            }
            if (requiresMatrixUpdate) {
              state.recalculateMatrices();
            }
            (window as any).__isWorkerSync = false;
          }
          break;
      }
    };

    this.worker.onerror = (err) => {
      console.error('Worker crashed or encountered an error:', err);
      // Basic fallback/recovery could go here
    };
  }

  // Engine proxy methods
  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  
  public setDuration(d: number) { 
    this.duration = d; 
    this.worker.postMessage({ type: 'SET_DURATION', duration: d });
  }

  public addTrack(track: Track) {
    this.tracks.push(track);
    this.worker.postMessage({ type: 'SET_TRACKS', tracks: this.tracks });
  }

  public setTracks(tracks: Track[]) {
    this.tracks = tracks;
    this.worker.postMessage({ type: 'SET_TRACKS', tracks: this.tracks });
  }

  public play() {
    this.isPlaying = true;
    this.worker.postMessage({ type: 'PLAY' });
  }

  public pause() {
    this.isPlaying = false;
    this.worker.postMessage({ type: 'PAUSE' });
  }

  public seek(time: number) {
    this.playhead = time;
    this.worker.postMessage({ type: 'SEEK', time });
  }

  // State updates from main thread to worker (e.g., when a user drags a node)
  public syncNodeUpdate(nodeId: string, updates: Partial<SceneNode>) {
    this.worker.postMessage({ type: 'UPDATE_NODE', nodeId, updates });
  }

  public zoomIn() {
    this.worker.postMessage({ type: 'ZOOM_IN' });
  }

  public zoomOut() {
    this.worker.postMessage({ type: 'ZOOM_OUT' });
  }
}
