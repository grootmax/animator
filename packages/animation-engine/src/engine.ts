import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
import { createSceneGraphStore, SPATIAL_X, SPATIAL_Y, SPATIAL_ROTATION, SPATIAL_SCALE_X, SPATIAL_SCALE_Y, SPATIAL_OPACITY, SPATIAL_IS_DIRTY } from '@monorepo/scene-graph';

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

const PROPERTY_TO_OFFSET: Record<string, number> = {
  'x': SPATIAL_X,
  'y': SPATIAL_Y,
  'rotation': SPATIAL_ROTATION,
  'scaleX': SPATIAL_SCALE_X,
  'scaleY': SPATIAL_SCALE_Y,
  'opacity': SPATIAL_OPACITY
};

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private lastTime = 0;
  private rafId: number | null = null;
  public loop = true;
  private duration = 5000; // ms

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
    this.playhead = time;
    this.updateNodes();
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.playhead += dt;

    if (this.playhead > this.duration) {
      if (this.loop) {
        this.playhead = this.playhead % this.duration;
      } else {
        this.playhead = this.duration;
        this.pause();
      }
    }

    this.updateNodes();

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
    const state = this.store.getState();
    const buffer = state.spatialBuffer;
    const nodeOffsetMap = state.nodeOffsetMap;
    
    let requiresMatrixUpdate = false;

    // Loop directly over tracks to avoid allocations
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      const offset = nodeOffsetMap[track.nodeId];
      
      if (offset === undefined) continue;

      const [start, end] = this.binarySearchKeyframes(track.keyframes, this.playhead);

      if (!start || !end) continue;

      let value = start.value;
      if (start !== end) {
        const progress = (this.playhead - start.time) / (end.time - start.time);
        const easingFn = this.getEasingFunction(start.easing);
        const easedProgress = easingFn(progress);
        value = start.value + (end.value - start.value) * easedProgress;
      }

      const propOffset = PROPERTY_TO_OFFSET[track.property];
      
      if (buffer[offset + propOffset] !== value) {
        buffer[offset + propOffset] = value;
        buffer[offset + SPATIAL_IS_DIRTY] = 1;
        requiresMatrixUpdate = true;
      }
    }

    if (requiresMatrixUpdate) {
      state.recalculateMatrices();
    }
  }
}
