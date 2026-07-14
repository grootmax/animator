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

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private startTime = 0;
  private startPlayhead = 0;
  private rafId: number | null = null;
  public loop = true;
  private duration = 5000; // ms
  private fps = 60;

  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  public getFps() { return this.fps; }

  private getFrameDuration() {
    return 1000 / this.fps;
  }

  private snapTime(time: number) {
    const frameDuration = this.getFrameDuration();
    return Math.round(time / frameDuration) * frameDuration;
  }

  private snapAllToCurrentFps() {
    this.duration = this.snapTime(this.duration);
    this.playhead = this.snapTime(this.playhead);
    for (const track of this.tracks) {
      for (const kf of track.keyframes) {
        kf.time = this.snapTime(kf.time);
      }
    }
    this.updateNodes();
  }

  public setFps(fps: number) {
    this.fps = fps;
    this.snapAllToCurrentFps();
  }

  public setDuration(d: number) {
    this.duration = this.snapTime(d);
  }

  public setTracks(tracks: Track[]) {
    this.tracks = tracks;
    this.snapAllToCurrentFps();
  }

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
  }

  public addTrack(track: Track) {
    for (const kf of track.keyframes) {
      kf.time = this.snapTime(kf.time);
    }
    // Sort keyframes by time
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.startTime = performance.now();
    this.startPlayhead = this.playhead;
    this.tick();
  }

  public pause() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public seek(time: number) {
    this.playhead = this.snapTime(time);
    this.updateNodes();
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = now - this.startTime;
    
    let rawNewPlayhead = this.startPlayhead + elapsed;
    let newPlayhead = this.snapTime(rawNewPlayhead);

    if (newPlayhead > this.duration) {
      if (this.loop) {
        this.startTime = now;
        rawNewPlayhead = rawNewPlayhead % this.duration;
        this.startPlayhead = rawNewPlayhead;
        newPlayhead = this.snapTime(rawNewPlayhead);
      } else {
        newPlayhead = this.duration;
        this.playhead = newPlayhead;
        this.updateNodes();
        this.pause();
        return;
      }
    }

    if (this.playhead !== newPlayhead) {
      this.playhead = newPlayhead;
      this.updateNodes();
    }

    if (this.isPlaying) {
      this.rafId = requestAnimationFrame(this.tick);
    }
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
