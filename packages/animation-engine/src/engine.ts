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

const FIXED_STEP = 1000 / 60; // 16.666... ms

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private lastTime = 0;
  private rafId: number | null = null;
  public loop = true;
  private duration = 5000; // ms

  private accumulator = 0;
  private currentStep = 0;

  public getPlayhead() { return this.playhead; }
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
    this.accumulator = 0;
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
    this.currentStep = Math.round(time / FIXED_STEP);
    this.playhead = this.currentStep * FIXED_STEP;

    if (this.playhead > this.duration) {
      this.playhead = this.duration;
    } else if (this.playhead < 0) {
      this.playhead = 0;
      this.currentStep = 0;
    }

    this.updateNodes();
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      this.currentStep++;
      
      let nextPlayhead = this.currentStep * FIXED_STEP;
      
      if (nextPlayhead > this.duration + 0.0001) {
        if (this.loop) {
          this.currentStep = 0;
          this.playhead = 0;
        } else {
          this.playhead = this.duration;
          this.pause();
          break;
        }
      } else {
        this.playhead = nextPlayhead;
      }
      
      steps++;
    }

    if (steps > 0 || !this.isPlaying) {
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
    const updates: Record<string, any> = {};

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

      if (!updates[track.nodeId]) {
        updates[track.nodeId] = {};
      }
      updates[track.nodeId][track.property] = value;
    }

    const storeState = this.store.getState();

    if (Object.keys(updates).length > 0) {
      if (typeof storeState.batchUpdateAndRecalculate === 'function') {
        storeState.batchUpdateAndRecalculate(updates);
      } else {
        let requiresMatrixUpdate = false;
        for (const [nodeId, nodeUpdates] of Object.entries(updates)) {
          storeState.updateNode(nodeId, nodeUpdates);
          requiresMatrixUpdate = true;
        }

        if (requiresMatrixUpdate) {
          storeState.recalculateMatrices();
        }
      }
    }
  }
}
