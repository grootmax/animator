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
  public fps = 60; // Configured frame rate
  private currentFrame = 0; // Primary source of truth for playhead
  private isPlaying = false;
  private lastTime = 0;
  private rafId: number | null = null;
  public loop = true;
  private duration = 5000; // ms

  public getPlayhead() { return this.currentFrame * (1000 / this.fps); }
  public getPlayheadFrame() { return this.currentFrame; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  public setDuration(d: number) { this.duration = d; }
  public setTracks(tracks: Track[]) { this.tracks = tracks; }

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
  }

  public addTrack(track: Track) {
    // Sort keyframes by time
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTime = performance.now();
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
    const msPerFrame = 1000 / this.fps;
    this.currentFrame = Math.round(time / msPerFrame);
    const totalFrames = Math.ceil(this.duration / msPerFrame);
    this.currentFrame = Math.max(0, Math.min(this.currentFrame, totalFrames));
    this.updateNodes();
  }

  public seekFrame(frame: number) {
    const totalFrames = Math.ceil(this.duration / (1000 / this.fps));
    this.currentFrame = Math.max(0, Math.min(Math.round(frame), totalFrames));
    this.updateNodes();
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const msPerFrame = 1000 / this.fps;

    let framesToAdvance = 0;
    while (this.lastTime + msPerFrame <= now) {
      framesToAdvance++;
      this.lastTime += msPerFrame;
    }

    if (framesToAdvance > 0) {
      this.currentFrame += framesToAdvance;
      const totalFrames = Math.ceil(this.duration / msPerFrame);

      if (this.currentFrame > totalFrames) {
        if (this.loop) {
          this.currentFrame = this.currentFrame % totalFrames;
        } else {
          this.currentFrame = totalFrames;
          this.pause();
        }
      }

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
    const time = this.currentFrame * (1000 / this.fps);
    const updates = new Map<string, any>();

    for (const track of this.tracks) {
      const [start, end] = this.binarySearchKeyframes(track.keyframes, time);

      if (!start || !end) continue;

      let value = start.value;
      if (start !== end) {
        const progress = (time - start.time) / (end.time - start.time);
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

