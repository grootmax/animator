import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';

export interface Keyframe {
  id: string;
  time: number; // in milliseconds
  value: number | string;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'fill' | 'stroke' | 'pathData';
  keyframes: Keyframe[];
}

function parseHexColor(hex: string) {
  if (!/^#([0-9A-F]{3}){1,2}$/i.test(hex)) return null;
  let c = hex.substring(1).split('');
  if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  const num = parseInt(c.join(''), 16);
  return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
  };
}

function interpolateHexColor(start: string, end: string, progress: number): string {
  const c1 = parseHexColor(start);
  const c2 = parseHexColor(end);

  if (!c1 || !c2) return start;

  const r = Math.round(c1.r + (c2.r - c1.r) * progress);
  const g = Math.round(c1.g + (c2.g - c1.g) * progress);
  const b = Math.round(c1.b + (c2.b - c1.b) * progress);

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function tokenizePath(path: string) {
  const regex = /([a-zA-Z])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  const tokens: { type: 'cmd' | 'num', val: string | number }[] = [];
  let match;
  while ((match = regex.exec(path)) !== null) {
      if (match[1]) tokens.push({ type: 'cmd', val: match[1] });
      else if (match[2]) tokens.push({ type: 'num', val: parseFloat(match[2]) });
  }
  return tokens;
}

function interpolatePath(start: string, end: string, progress: number): string {
  const t1 = tokenizePath(start);
  const t2 = tokenizePath(end);

  if (t1.length !== t2.length) return start;
  
  let result = '';
  for (let i = 0; i < t1.length; i++) {
      const tk1 = t1[i];
      const tk2 = t2[i];
      
      if (tk1.type !== tk2.type) return start;
      if (tk1.type === 'cmd' && tk1.val !== tk2.val) return start;
      
      if (tk1.type === 'cmd') {
          result += tk1.val + ' ';
      } else {
          result += ((tk1.val as number) + ((tk2.val as number) - (tk1.val as number)) * progress) + ' ';
      }
  }
  return result.trim();
}

function interpolateValue(start: number | string, end: number | string, progress: number, property: string): number | string {
  if (typeof start === 'number' && typeof end === 'number') {
    return start + (end - start) * progress;
  }
  
  if (typeof start === 'string' && typeof end === 'string') {
    if (property === 'fill' || property === 'stroke') {
      return interpolateHexColor(start, end, progress);
    }
    if (property === 'pathData') {
      return interpolatePath(start, end, progress);
    }
  }
  
  return start;
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

  public role: NetworkRole = 'standalone';
  public onHeartbeat?: (heartbeat: Heartbeat) => void;
  private heartbeatTimer: any = null;
  private heartbeatRate = 100;
  public driftThreshold = 150;

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
    this.tracks.push(track);
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTime = performance.now();
    this.tick();

    if (this.role === 'leader') {
      this.broadcastHeartbeat();
      this.startHeartbeat();
    }
  }

  public pause() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.role === 'leader') {
      this.stopHeartbeat();
      this.broadcastHeartbeat();
    }
  }

  public seek(time: number) {
    this.playhead = time;
    this.updateNodes();

    if (this.role === 'leader') {
      this.broadcastHeartbeat();
    }
  }

  public setRole(role: NetworkRole) {
    this.role = role;
    if (role !== 'leader') {
      this.stopHeartbeat();
    } else if (this.isPlaying) {
      this.startHeartbeat();
    }
  }

  private startHeartbeat() {
    if (this.role !== 'leader') return;
    if (this.heartbeatTimer !== null) return;
    
    this.heartbeatTimer = setInterval(() => {
      this.broadcastHeartbeat();
    }, this.heartbeatRate);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private broadcastHeartbeat() {
    if (this.role === 'leader' && this.onHeartbeat) {
      this.onHeartbeat({
        playhead: this.playhead,
        isPlaying: this.isPlaying
      });
    }
  }

  public receiveHeartbeat(heartbeat: Heartbeat, estimatedLatency: number = 0) {
    if (this.role !== 'follower') return;

    const targetPlayhead = heartbeat.isPlaying 
      ? heartbeat.playhead + estimatedLatency 
      : heartbeat.playhead;

    const drift = Math.abs(this.playhead - targetPlayhead);

    if (drift > this.driftThreshold) {
      this.seek(targetPlayhead);
    }

    if (heartbeat.isPlaying && !this.isPlaying) {
      this.play();
    } else if (!heartbeat.isPlaying && this.isPlaying) {
      this.pause();
    }
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
    const updates = new Map<string, any>();

    for (const track of this.tracks) {
      const keyframesArray = Object.values(track.keyframes).sort((a, b) => {
        if (a.time === b.time) return a.id.localeCompare(b.id);
        return a.time - b.time;
      });
      const [start, end] = this.binarySearchKeyframes(keyframesArray, this.playhead);

      if (!start || !end) continue;

      let value = start.value;
      if (start !== end) {
        const progress = (this.playhead - start.time) / (end.time - start.time);
        const easingFn = this.getEasingFunction(start.easing);
        const easedProgress = easingFn(progress);
        value = interpolateValue(start.value, end.value, easedProgress, track.property);
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
