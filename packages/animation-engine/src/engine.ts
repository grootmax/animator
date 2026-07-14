import { createSceneGraphStore } from '@monorepo/scene-graph';

export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';

export interface Keyframe {
  time: number; // in milliseconds
  value: number;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity';
  keyframes: Keyframe[];
}

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private duration = 5000; // ms
  private worker: Worker;

  public loop = true;

  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  
  public setDuration(d: number) { 
    this.duration = d; 
    this.worker.postMessage({ type: 'SET_DURATION', payload: { duration: d } });
  }
  
  public setTracks(tracks: Track[]) { 
    this.tracks = tracks; 
    this.worker.postMessage({ type: 'SET_TRACKS', payload: { tracks } });
  }

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
    
    // Initialize Web Worker
    this.worker = new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'PLAYHEAD_UPDATE') {
        this.playhead = msg.payload.playhead;
      } else if (msg.type === 'STOPPED') {
        this.isPlaying = false;
        this.playhead = msg.payload.playhead;
      } else if (msg.type === 'DELTA_UPDATES') {
        const deltaUpdates = msg.payload;
        
        // Sync delta updates back to the main thread store without triggering O(N) matrix math
        const currentState = this.store.getState();
        const newNodes = { ...currentState.nodes };
        let hasChanges = false;
        
        for (const update of deltaUpdates) {
          const node = newNodes[update.id];
          if (node) {
            newNodes[update.id] = {
              ...node,
              ...update.updates,
              localMatrix: update.localMatrix,
              worldMatrix: update.worldMatrix,
              isDirty: false // Worker already processed matrices!
            };
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          // Note: Zustand requires us to use setState to trigger subscriptions
          this.store.setState({ nodes: newNodes });
        }
      }
    };
    
    // Subscribe to store changes (like adding nodes, changing properties via UI)
    // and sync them down to the worker so it has an accurate tree for matrix logic
    this.store.subscribe((state: any) => {
      // Avoid sending matrix updates back to the worker if they came from the worker,
      // but simpler: just send the whole state when something changes from the UI.
      // For efficiency, in a production app we'd only sync what changed.
      this.worker.postMessage({ type: 'SYNC_SCENE', payload: { nodes: state.nodes, rootId: state.rootId } });
    });
    
    // Initial sync
    const state = this.store.getState();
    this.worker.postMessage({ type: 'SYNC_SCENE', payload: { nodes: state.nodes, rootId: state.rootId } });
  }

  public addTrack(track: Track) {
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
    this.worker.postMessage({ type: 'ADD_TRACK', payload: { track } });
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.worker.postMessage({ type: 'PLAY' });
  }

  public pause() {
    this.isPlaying = false;
    this.worker.postMessage({ type: 'PAUSE' });
  }

  public dispose() {
    this.worker.terminate();
  }

  public seek(time: number) {
    this.playhead = time;
    this.worker.postMessage({ type: 'SEEK', payload: { time } });
  }
}
