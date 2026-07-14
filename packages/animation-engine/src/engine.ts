import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
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

const workerCode = `
  let isPlaying = false;
  let playhead = 0;
  let duration = 5000;
  let loop = true;
  let lastTime = 0;
  let tickInterval = null;
  let broadcastInterval = null;

  const TICK_RATE = 1000 / 60; 
  const UI_SYNC_RATE = 1000 / 30; // 30fps UI batch rate

  function tick() {
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;
    playhead += dt;

    if (playhead > duration) {
      if (loop) {
        playhead = playhead % duration;
      } else {
        playhead = duration;
        isPlaying = false;
        clearInterval(tickInterval);
        clearInterval(broadcastInterval);
        postMessage({ type: 'update', playhead, isPlaying });
        postMessage({ type: 'renderTick', playhead });
        return;
      }
    }
    postMessage({ type: 'renderTick', playhead });
  }

  self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'play') {
      if (isPlaying) return;
      isPlaying = true;
      lastTime = performance.now();
      tickInterval = setInterval(tick, TICK_RATE);
      broadcastInterval = setInterval(() => {
        postMessage({ type: 'update', playhead, isPlaying });
      }, UI_SYNC_RATE);
    } else if (type === 'pause') {
      if (!isPlaying) return;
      isPlaying = false;
      clearInterval(tickInterval);
      clearInterval(broadcastInterval);
      postMessage({ type: 'update', playhead, isPlaying });
    } else if (type === 'seek') {
      playhead = payload;
      if (isPlaying) {
        lastTime = performance.now();
      }
      postMessage({ type: 'renderTick', playhead });
      postMessage({ type: 'update', playhead, isPlaying });
    } else if (type === 'setDuration') {
      duration = payload;
    } else if (type === 'setLoop') {
      loop = payload;
    }
  };
`;

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private loopState = true;
  private duration = 5000; // ms
  private worker: Worker;
  
  private listeners: Set<(state: { playhead: number, isPlaying: boolean }) => void> = new Set();

  public get loop() { return this.loopState; }
  public set loop(val: boolean) { 
    this.loopState = val;
    this.worker.postMessage({ type: 'setLoop', payload: val });
  }

  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  public setDuration(d: number) { 
    this.duration = d; 
    this.worker.postMessage({ type: 'setDuration', payload: d });
  }
  public setTracks(tracks: Track[]) { this.tracks = tracks; }

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(workerUrl);
    
    this.worker.onmessage = (e) => {
      const { type, playhead, isPlaying } = e.data;
      if (type === 'renderTick') {
        this.playhead = playhead;
        this.updateNodes();
      } else if (type === 'update') {
        this.playhead = playhead;
        this.isPlaying = isPlaying;
        this.notifyListeners();
      }
    };
  }

  public subscribeUI(listener: (state: { playhead: number, isPlaying: boolean }) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener({ playhead: this.playhead, isPlaying: this.isPlaying });
    }
  }

  public addTrack(track: Track) {
    // Sort keyframes by time
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.worker.postMessage({ type: 'play' });
    this.notifyListeners();
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.worker.postMessage({ type: 'pause' });
    this.notifyListeners();
  }

  public seek(time: number) {
    this.playhead = time;
    this.worker.postMessage({ type: 'seek', payload: time });
  }

  private getEasingFunction(type: EasingType = 'linear') {
    switch (type) {
      case 'easeInQuad': return easeInQuad;
      case 'easeOutQuad': return easeOutQuad;
      case 'easeInOutQuad': return easeInOutQuad;
      default: return linear;
    }
  }

  private binarySearchKeyframes(keyframes: Keyframe[], time: number): [Keyframe | null, Keyframe | null] {
    if (keyframes.length === 0) return [null, null];
    if (time <= keyframes[0].time) return [keyframes[0], keyframes[0]];
    if (time >= keyframes[keyframes.length - 1].time) return [keyframes[keyframes.length - 1], keyframes[keyframes.length - 1]];

    let low = 0;
    let high = keyframes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (keyframes[mid].time === time) return [keyframes[mid], keyframes[mid]];
      if (keyframes[mid].time < time) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return [keyframes[high], keyframes[low]];
  }

  private updateNodes() {
    const updates = new Map<string, any>();

    for (const track of this.tracks) {
      const [start, end] = this.binarySearchKeyframes(track.keyframes, this.playhead);

      if (!start || !end) continue;

      let value = start.value;
      if (start !== end) {
        const progress = (this.playhead - start.time) / (end.time - start.time);
        const easingFn = this.getEasingFunction(start.easing);
        const easedProgress = easingFn(progress);
        value = start.value + (end.value - start.value) * easedProgress;
      }

      if (!updates.has(track.nodeId)) {
        updates.set(track.nodeId, {});
      }
      updates.get(track.nodeId)[track.property] = value;
    }

    const storeState = this.store.getState();
    let requiresMatrixUpdate = false;

    for (const [nodeId, nodeUpdates] of updates.entries()) {
      storeState.updateNode(nodeId, nodeUpdates);
      requiresMatrixUpdate = true;
    }

    if (requiresMatrixUpdate) {
      storeState.recalculateMatrices();
    }
  }
}
