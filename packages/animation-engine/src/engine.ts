import { createSceneGraphStore } from '@monorepo/scene-graph';
import type { Track, Keyframe, EasingType } from './types';

export { Track, Keyframe, EasingType };

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private worker: Worker;
  
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  public loop = true;
  private duration = 5000;

  // Batching for rAF
  private pendingUpdates: Record<string, any> | null = null;
  private rafId: number | null = null;

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
    
    // Initialize Web Worker using modern ES module syntax
    this.worker = new Worker(new URL('./playback.worker.js', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e) => {
      const { type, playhead, updates, data } = e.data;
      if (type === 'STATE_UPDATE') {
        this.playhead = playhead;
        this.queueUpdate(updates);
      } else if (type === 'EXPORT_READY') {
        if (this.onExportReadyCallback) {
          this.onExportReadyCallback(data);
          this.onExportReadyCallback = null;
        }
      }
    };
    
    this.worker.postMessage({
      type: 'INIT',
      payload: { tracks: this.tracks, duration: this.duration, loop: this.loop }
    });
  }

  private queueUpdate(updates: Record<string, any>) {
    // If pendingUpdates is null, we schedule a rAF to process the batch
    if (!this.pendingUpdates) {
      this.pendingUpdates = {};
      this.rafId = requestAnimationFrame(this.applyUpdates);
    }
    
    // Merge new updates into pending (latest wins for the frame)
    for (const [nodeId, nodeUpdates] of Object.entries(updates)) {
      if (!this.pendingUpdates[nodeId]) {
        this.pendingUpdates[nodeId] = {};
      }
      Object.assign(this.pendingUpdates[nodeId], nodeUpdates);
    }
  }

  private applyUpdates = () => {
    this.rafId = null;
    if (!this.pendingUpdates) return;
    
    const storeState = this.store.getState();
    let requiresMatrixUpdate = false;

    for (const [nodeId, nodeUpdates] of Object.entries(this.pendingUpdates)) {
      storeState.updateNode(nodeId, nodeUpdates);
      requiresMatrixUpdate = true;
    }

    if (requiresMatrixUpdate) {
      storeState.recalculateMatrices();
    }
    
    this.pendingUpdates = null;
  }

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
    this.worker.postMessage({ type: 'SET_TRACKS', payload: { tracks: this.tracks } });
  }

  public addTrack(track: Track) {
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
    this.worker.postMessage({ type: 'SET_TRACKS', payload: { tracks: this.tracks } });
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.worker.postMessage({ type: 'PLAY' });
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.worker.postMessage({ type: 'PAUSE' });
  }

  public seek(time: number) {
    this.playhead = time;
    this.worker.postMessage({ type: 'SEEK', payload: { time } });
  }

  private onExportReadyCallback: ((data: any) => void) | null = null;
  public exportFrames(): Promise<any> {
    return new Promise((resolve) => {
      this.onExportReadyCallback = resolve;
      this.worker.postMessage({ type: 'EXPORT' });
    });
  }
  
  public destroy() {
    this.worker.terminate();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }
}
