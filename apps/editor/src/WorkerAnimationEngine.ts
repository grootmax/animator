import { Track } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export class WorkerAnimationEngine {
  private worker: Worker;
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private duration = 5000;
  private isWorkerUpdating = false;

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
    this.worker = new Worker(new URL('./animation.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'TICK') {
        this.playhead = data.playhead;
        this.isWorkerUpdating = true;
        this.store.getState().updateNodeMatrices(data.nodes);
        this.isWorkerUpdating = false;
      } else if (data.type === 'PLAY_STATE') {
        this.isPlaying = data.isPlaying;
      }
    };

    // Initial sync
    const state = this.store.getState();
    this.worker.postMessage({
      type: 'INIT',
      nodes: state.nodes,
      rootId: state.rootId,
      tracks: this.tracks,
      duration: this.duration
    });

    // Keep worker synced when user modifies scene (rough sync, ideally we'd only sync on change before play)
    this.store.subscribe((state) => {
      if (!this.isPlaying && !this.isWorkerUpdating) {
         this.worker.postMessage({
           type: 'SYNC_NODES',
           nodes: state.nodes,
           rootId: state.rootId
         });
      }
    });
  }

  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  
  public setDuration(d: number) {
    this.duration = d;
    this.worker.postMessage({ type: 'SET_DURATION', duration: d });
  }
  
  public setTracks(tracks: Track[]) {
    this.tracks = tracks;
  }

  public addTrack(track: Track) {
    this.tracks.push(track);
    this.worker.postMessage({ type: 'ADD_TRACK', track });
  }

  public play() {
    // Send updated scene state just before playing in case it was modified
    const state = this.store.getState();
    this.worker.postMessage({ type: 'SYNC_NODES', nodes: state.nodes, rootId: state.rootId });
    this.worker.postMessage({ type: 'PLAY' });
    this.isPlaying = true;
  }

  public pause() {
    this.worker.postMessage({ type: 'PAUSE' });
    this.isPlaying = false;
  }

  public seek(time: number) {
    this.playhead = time;
    this.worker.postMessage({ type: 'SEEK', time });
  }
}
