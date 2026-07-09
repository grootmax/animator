import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { NetworkClock, NetworkCommand } from './network';

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

  public clock: NetworkClock;
  private commandQueue: NetworkCommand[] = [];

  public getPlayhead() { return this.playhead; }
  public getTracks() { return this.tracks; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  public setDuration(d: number) { this.duration = d; }
  public setTracks(tracks: Track[]) { this.tracks = tracks; }

  constructor(store: ReturnType<typeof createSceneGraphStore>, clock: NetworkClock = new NetworkClock()) {
    this.store = store;
    this.clock = clock;
  }

  public addTrack(track: Track) {
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.push(track);
  }

  private getSchedulingBuffer(): number {
    // Dynamic buffer based on RTT, capped at 250ms
    return Math.min(250, this.clock.estimatedRTT + 50); 
  }

  public scheduleCommand(command: NetworkCommand) {
    const now = this.clock.time;
    // If the command arrives after its scheduled execution time, it means
    // the network delay/jitter exceeded our chosen scheduling buffer.
    if (now > command.scheduledStartTime) {
      console.warn("Network jitter exceeds the scheduling buffer capacity");
    }

    this.commandQueue.push(command);
    this.commandQueue.sort((a, b) => a.scheduledStartTime - b.scheduledStartTime);

    // If not currently ticking, start ticking to process the delayed start
    if (this.rafId === null) {
      this.lastTime = this.clock.time;
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  public play() {
    this.scheduleCommand({ type: 'play', scheduledStartTime: this.clock.time + this.getSchedulingBuffer() });
  }

  public pause() {
    this.scheduleCommand({ type: 'pause', scheduledStartTime: this.clock.time + this.getSchedulingBuffer() });
  }

  public seek(time: number) {
    this.scheduleCommand({ type: 'seek', scheduledStartTime: this.clock.time + this.getSchedulingBuffer(), playhead: time });
  }

  private processCommands(now: number) {
    while (this.commandQueue.length > 0 && this.commandQueue[0].scheduledStartTime <= now) {
      const cmd = this.commandQueue.shift()!;
      
      switch (cmd.type) {
        case 'play':
          if (!this.isPlaying) {
            this.isPlaying = true;
            // Advance playhead by the time elapsed since the scheduled start time, to keep in sync.
            const elapsedSinceScheduled = Math.max(0, now - cmd.scheduledStartTime);
            this.playhead += elapsedSinceScheduled;
          }
          break;
        case 'pause':
          this.isPlaying = false;
          break;
        case 'seek':
          if (cmd.playhead !== undefined) {
            this.playhead = cmd.playhead;
            this.updateNodes();
          }
          break;
      }
    }
  }

  private tick = () => {
    const now = this.clock.time;
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.processCommands(now);

    if (this.isPlaying) {
      this.playhead += dt;

      if (this.playhead > this.duration) {
        if (this.loop) {
          this.playhead = this.playhead % this.duration;
        } else {
          this.playhead = this.duration;
          this.isPlaying = false; // deterministic local stop
        }
      }
    }

    // Prepare frame buffer
    this.updateNodes();

    // Determine if we need to continue ticking
    if (this.isPlaying || this.commandQueue.length > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.rafId = null;
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
