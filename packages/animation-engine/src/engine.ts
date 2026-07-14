import { createSceneGraphStore } from '@monorepo/scene-graph';
import { Track } from './types';

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private _loop = true;
  public get loop() { return this._loop; }
  public set loop(val: boolean) { this._loop = val; this.worker?.postMessage({ type: 'SET_LOOP', payload: val }); }
  private duration = 5000;
  private worker: Worker | null = null;

  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  
  public setDuration(d: number) { 
    this.duration = d; 
    this.worker?.postMessage({ type: 'SET_DURATION', payload: d });
  }

  public setTracks(tracks: Track[]) { 
    this.tracks = tracks; 
    this.worker?.postMessage({ type: 'SET_TRACKS', payload: tracks });
  }

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
    this.initWorker();
  }

  private initWorker() {
    try {
      this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'TICK' || type === 'SEEK_UPDATE') {
          this.playhead = payload.playhead;
          if (payload.isPlaying !== undefined) {
            this.isPlaying = payload.isPlaying;
          }
          this.applyUpdates(payload.updates);
        }
      };
    } catch (err) {
      console.warn('Failed to initialize Web Worker for AnimationEngine, falling back?', err);
    }
  }

  private applyUpdates(updates: Record<string, any>) {
    const storeState = this.store.getState();
    let requiresMatrixUpdate = false;

    for (const [nodeId, nodeUpdates] of Object.entries(updates)) {
      storeState.updateNode(nodeId, nodeUpdates);
      requiresMatrixUpdate = true;
    }

    if (requiresMatrixUpdate) {
      storeState.recalculateMatrices();
    }
  }

  public addTrack(track: Track) {
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
    this.worker?.postMessage({ type: 'SET_TRACKS', payload: this.tracks });
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.worker?.postMessage({ type: 'PLAY' });
  }

  public pause() {
    this.isPlaying = false;
    this.worker?.postMessage({ type: 'PAUSE' });
  }

  public seek(time: number) {
    this.playhead = time;
    this.worker?.postMessage({ type: 'SEEK', payload: time });
  }
}
