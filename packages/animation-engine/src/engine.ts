import { linear, easeInQuad, easeOutQuad, easeInOutQuad, Matrix3, getTransformMatrix, multiplyMatrix, createMatrix } from '@monorepo/math';
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
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (wasPlaying) {
      // Synchronize direct mutations back to the main state store
      const storeState = this.store.getState();
      this.store.setState({ nodes: { ...storeState.nodes } });
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

  private recalculateMatricesDirect(storeState: any) {
    const { nodes, rootId } = storeState;
    if (!rootId || !nodes[rootId]) return;

    const traverse = (nodeId: string, parentWorldMatrix: Matrix3, parentWasDirty: boolean) => {
      const node = nodes[nodeId];
      if (!node) return;

      const isNowDirty = node.isDirty || parentWasDirty;
      let currentWorldMatrix = parentWorldMatrix;

      if (isNowDirty) {
        node.localMatrix = getTransformMatrix(
          node.x, node.y, 
          node.rotation, 
          node.scaleX, node.scaleY,
          node.skewX || 0, node.skewY || 0
        );
        currentWorldMatrix = multiplyMatrix(parentWorldMatrix, node.localMatrix);
        node.worldMatrix = currentWorldMatrix;
      } else {
        currentWorldMatrix = node.worldMatrix;
      }

      for (const childId of node.children) {
        traverse(childId, currentWorldMatrix, isNowDirty);
      }
    };

    traverse(rootId, createMatrix(), false);
  }

  private updateNodes() {
    const storeState = this.store.getState();
    let requiresMatrixUpdate = false;
    
    // In playback, bypass the Map allocation and mutate nodes directly.
    if (this.isPlaying) {
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

        const node = storeState.nodes[track.nodeId];
        if (node && (node as any)[track.property] !== value) {
          (node as any)[track.property] = value;
          node.isDirty = true;
          requiresMatrixUpdate = true;
        }
      }

      if (requiresMatrixUpdate) {
        this.recalculateMatricesDirect(storeState);
      }
    } else {
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

      for (const [nodeId, nodeUpdates] of updates.entries()) {
        storeState.updateNode(nodeId, nodeUpdates);
        requiresMatrixUpdate = true;
      }

      if (requiresMatrixUpdate) {
        storeState.recalculateMatrices();
      }
    }
  }
}
