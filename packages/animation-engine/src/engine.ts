import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';

export interface Keyframe {
  frame: number; // Discrete frame index
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
  private currentFrame = 0;
  private isPlaying = false;
  private rafId: number | null = null;
  public loop = true;
  private totalFrames = 300; // 5 seconds at 60fps
  private fps = 60;
  private lastTickTime = 0;

  public getPlayhead() { return this.currentFrame; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.totalFrames; }
  public setDuration(frames: number) { this.totalFrames = frames; }
  public setTracks(tracks: Track[]) { this.tracks = tracks; }
  public getFps() { return this.fps; }
  public setFps(fps: number) { this.fps = fps; }

  constructor(store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;
  }

  public addTrack(track: Track) {
    // Sort keyframes by frame
    track.keyframes.sort((a, b) => a.frame - b.frame);
    this.tracks.push(track);
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTickTime = performance.now();
    this.tick();
  }

  public pause() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public seek(frame: number) {
    this.currentFrame = Math.round(frame);
    this.updateNodes();
  }

  public renderHeadless(startFrame: number, endFrame: number, onFrame: (frame: number) => void) {
    // Export mode: process frames without RAF loop
    const wasPlaying = this.isPlaying;
    this.pause();
    for (let f = startFrame; f <= endFrame; f++) {
      this.currentFrame = f;
      this.updateNodes();
      onFrame(f);
    }
    if (wasPlaying) this.play();
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const frameDuration = 1000 / this.fps;
    const elapsed = now - this.lastTickTime;

    if (elapsed >= frameDuration) {
      // Step to next frame(s)
      const framesToAdvance = Math.floor(elapsed / frameDuration);
      this.lastTickTime += framesToAdvance * frameDuration;
      
      this.currentFrame += framesToAdvance;

      if (this.currentFrame > this.totalFrames) {
        if (this.loop) {
          this.currentFrame = this.currentFrame % this.totalFrames;
        } else {
          this.currentFrame = this.totalFrames;
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

  private binarySearchKeyframes(keyframes: Keyframe[], frame: number): [Keyframe | null, Keyframe | null] {
    if (keyframes.length === 0) return [null, null];
    if (frame <= keyframes[0].frame) return [keyframes[0], keyframes[0]];
    if (frame >= keyframes[keyframes.length - 1].frame) return [keyframes[keyframes.length - 1], keyframes[keyframes.length - 1]];

    let low = 0;
    let high = keyframes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (keyframes[mid].frame === frame) return [keyframes[mid], keyframes[mid]];
      if (keyframes[mid].frame < frame) {
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
      const [start, end] = this.binarySearchKeyframes(track.keyframes, this.currentFrame);

      if (!start || !end) continue;

      let value = start.value;
      if (start !== end) {
        const progress = (this.currentFrame - start.frame) / (end.frame - start.frame);
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
    
    // Batch all updates to avoid triggering multiple render cycles
    storeState.batchUpdateNodes(updates);
    
    if (Object.keys(updates).length > 0) {
      storeState.recalculateMatrices();
    }
  }
}
