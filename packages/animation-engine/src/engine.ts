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

class UpdatePacket {
  nodeId: string = '';
  property: string = '';
  value: number = 0;
}

class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;

  constructor(createFn: () => T, initialSize: number = 0) {
    this.createFn = createFn;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  get(): T {
    return this.pool.length > 0 ? this.pool.pop()! : this.createFn();
  }

  release(obj: T) {
    this.pool.push(obj);
  }
}

export class AnimationEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private tracks: Track[] = [];
  private playhead = 0;
  private isPlaying = false;
  private lastTime = 0;
  private rafId: number | null = null;
  public loop = true;
  private duration = 5000; // ms

  private updatePacketPool = new ObjectPool<UpdatePacket>(() => new UpdatePacket(), 100);
  private activePackets: UpdatePacket[] = [];
  private tempSearchRange: [Keyframe | null, Keyframe | null] = [null, null];

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
    if (keyframes.length === 0) {
      this.tempSearchRange[0] = null;
      this.tempSearchRange[1] = null;
      return this.tempSearchRange;
    }
    if (time <= keyframes[0].time) {
      this.tempSearchRange[0] = keyframes[0];
      this.tempSearchRange[1] = keyframes[0];
      return this.tempSearchRange;
    }
    if (time >= keyframes[keyframes.length - 1].time) {
      this.tempSearchRange[0] = keyframes[keyframes.length - 1];
      this.tempSearchRange[1] = keyframes[keyframes.length - 1];
      return this.tempSearchRange;
    }

    let low = 0;
    let high = keyframes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (keyframes[mid].time === time) {
        this.tempSearchRange[0] = keyframes[mid];
        this.tempSearchRange[1] = keyframes[mid];
        return this.tempSearchRange;
      }
      if (keyframes[mid].time < time) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    this.tempSearchRange[0] = keyframes[high];
    this.tempSearchRange[1] = keyframes[low];
    return this.tempSearchRange;
  }

  private updateNodes() {
    this.activePackets.length = 0;

    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      const range = this.binarySearchKeyframes(track.keyframes, this.playhead);
      const start = range[0];
      const end = range[1];

      if (!start || !end) continue;

      let value = start.value;
      if (start !== end) {
        const progress = (this.playhead - start.time) / (end.time - start.time);
        const easingFn = this.getEasingFunction(start.easing);
        const easedProgress = easingFn(progress);
        value = start.value + (end.value - start.value) * easedProgress;
      }

      const packet = this.updatePacketPool.get();
      packet.nodeId = track.nodeId;
      packet.property = track.property;
      packet.value = value;
      this.activePackets.push(packet);
    }

    const storeState = this.store.getState();
    let requiresMatrixUpdate = false;

    for (let i = 0; i < this.activePackets.length; i++) {
      const packet = this.activePackets[i];
      storeState.updateNodeInPlace(packet.nodeId, packet.property, packet.value);
      this.updatePacketPool.release(packet);
      requiresMatrixUpdate = true;
    }

    if (requiresMatrixUpdate) {
      storeState.recalculateMatrices();
    }
  }
}
