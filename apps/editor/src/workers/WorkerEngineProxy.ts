import { Track } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export class WorkerEngineProxy {
  private worker: Worker;
  private store: ReturnType<typeof createSceneGraphStore>;
  
  // Local cache of engine state to satisfy synchronous UI calls
  private state = {
    playhead: 0,
    isPlaying: false,
    duration: 5000,
    tracks: [] as Track[]
  };

  private isWorkerUpdate = false;

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
    
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e) => {
      const { type, nodes, state } = e.data;
      if (type === 'SYNC_NODES') {
        this.isWorkerUpdate = true;
        this.store.setState((prev) => ({ ...prev, nodes }));
        this.isWorkerUpdate = false;
      } else if (type === 'SYNC_ENGINE_STATE') {
        this.state = state;
      }
    };

    // Forward main thread state changes to the worker
    this.store.subscribe((state) => {
      if (!this.isWorkerUpdate) {
        this.worker.postMessage({ type: 'SYNC_FROM_MAIN', payload: state.nodes });
      }
    });

    // Request initial state
    this.worker.postMessage({ type: 'GET_STATE' });
  }

  // API compatible with AnimationEngine
  public getPlayhead() { return this.state.playhead; }
  public getTracks() { return this.state.tracks; }
  public getIsPlaying() { return this.state.isPlaying; }
  public getDuration() { return this.state.duration; }
  
  public setDuration(d: number) {
    this.state.duration = d;
    this.worker.postMessage({ type: 'SET_DURATION', payload: d });
  }
  
  public setTracks(tracks: Track[]) {
    this.state.tracks = tracks;
    this.worker.postMessage({ type: 'SET_TRACKS', payload: tracks });
  }

  public addTrack(track: Track) {
    // Optimistic local update
    this.state.tracks = [...this.state.tracks, track];
    this.worker.postMessage({ type: 'ADD_TRACK', payload: track });
  }

  public play() {
    this.state.isPlaying = true;
    this.worker.postMessage({ type: 'PLAY' });
  }

  public pause() {
    this.state.isPlaying = false;
    this.worker.postMessage({ type: 'PAUSE' });
  }

  public seek(time: number) {
    this.state.playhead = time;
    this.worker.postMessage({ type: 'SEEK', payload: time });
  }
}
