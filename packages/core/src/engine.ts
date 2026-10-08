import type { Keyframe, SceneGraphStore, SceneNode, Track } from "./store.js";

function applyEasing(progress: number, easing?: string): number {
  if (easing === "easeInQuad") return progress * progress;
  if (easing === "easeOutQuad") return progress * (2 - progress);
  if (easing === "easeInOutQuad")
    return progress < 0.5
      ? 2 * progress * progress
      : -1 + (4 - 2 * progress) * progress;
  return progress; // linear
}

function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) {
    c = `${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  }
  if (c.length !== 6) return null;
  const num = Number.parseInt(c, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function interpolateHexColor(
  start: string,
  end: string,
  progress: number,
): string {
  const c1 = parseHexColor(start);
  const c2 = parseHexColor(end);
  if (!c1 || !c2) return start;

  const r = Math.round(c1.r + (c2.r - c1.r) * progress);
  const g = Math.round(c1.g + (c2.g - c1.g) * progress);
  const b = Math.round(c1.b + (c2.b - c1.b) * progress);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

function interpolateValues(
  start: unknown,
  end: unknown,
  progress: number,
): unknown {
  if (typeof start === "number" && typeof end === "number") {
    return start + (end - start) * progress;
  }
  if (typeof start === "string" && typeof end === "string") {
    if (start.startsWith("#") && end.startsWith("#")) {
      return interpolateHexColor(start, end, progress);
    }
  }
  return start;
}

export class AnimationEngine {
  private store: SceneGraphStore;
  private tracks: Track[] = [];
  private playhead = 0; // ms
  private isPlaying = false;
  private offlineMode = false;
  private fps = 60;
  private duration = 5000; // ms
  public loop = true;
  private rafId: number | null = null;
  private lastWallTime = 0;

  constructor(store: SceneGraphStore) {
    this.store = store;
  }

  public setOfflineMode(offline: boolean): void {
    this.offlineMode = offline;
    if (offline && this.rafId !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  public isOfflineMode(): boolean {
    return this.offlineMode;
  }

  public setFps(fps: number): void {
    this.fps = fps;
  }

  public getFps(): number {
    return this.fps;
  }

  public getPlayhead(): number {
    return this.playhead;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getDuration(): number {
    return this.duration;
  }

  public setDuration(duration: number): void {
    this.duration = duration;
  }

  public setTracks(tracks: Track[]): void {
    this.tracks = tracks;
  }

  public getTracks(): Track[] {
    return this.tracks;
  }

  public addTrack(track: Track): void {
    this.tracks.push(track);
  }

  public play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    if (!this.offlineMode) {
      this.lastWallTime =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.tick();
    }
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  public seek(timeMs: number): void {
    if (this.offlineMode) {
      // Offline mode: exact timestamp matching down to sub-millisecond precision.
      // NO 16.67ms time quantization rounding drift!
      this.playhead = timeMs;
    } else {
      // Real-time playback mode: quantization rounding
      this.playhead = Math.round(timeMs / 16.67) * 16.67;
    }

    this.updateNodes();
  }

  public step(deltaTimeMs: number): void {
    if (this.offlineMode) {
      // Offline mode: advance explicitly by exact millisecond intervals without wall clock
      const nextTime = this.playhead + deltaTimeMs;
      this.playhead = nextTime;
      if (this.duration > 0 && this.playhead > this.duration) {
        if (this.loop) {
          this.playhead = this.playhead % this.duration;
        } else {
          this.playhead = this.duration;
          this.isPlaying = false;
        }
      }
      this.updateNodes();
    } else {
      // Real-time mode
      this.seek(this.playhead + deltaTimeMs);
    }
  }

  public setFrame(frameIndex: number): void {
    const frameDurationMs = 1000 / this.fps;
    const timeMs = frameIndex * frameDurationMs;
    this.seek(timeMs);
  }

  public stepFrame(frameCount = 1): void {
    const frameDurationMs = 1000 / this.fps;
    this.step(frameCount * frameDurationMs);
  }

  public getCurrentFrame(): number {
    const frameDurationMs = 1000 / this.fps;
    return Math.floor(this.playhead / frameDurationMs);
  }

  public getTotalFrames(): number {
    const frameDurationMs = 1000 / this.fps;
    return Math.ceil(this.duration / frameDurationMs);
  }

  private tick = (): void => {
    if (!this.isPlaying || this.offlineMode) return;

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const dt = now - this.lastWallTime;
    this.lastWallTime = now;

    this.seek(this.playhead + dt);

    if (this.isPlaying && typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  public updateNodes(): void {
    const updates = new Map<string, Record<string, unknown>>();

    for (const track of this.tracks) {
      const keyframesArray = Array.isArray(track.keyframes)
        ? track.keyframes
        : Object.values(track.keyframes);

      const sortedKeyframes = [...keyframesArray].sort(
        (a, b) => a.time - b.time,
      );
      if (sortedKeyframes.length === 0) continue;

      const [start, end] = this.findKeyframeRange(
        sortedKeyframes,
        this.playhead,
      );
      if (!start || !end) continue;

      let value = start.value;
      if (start !== end && end.time > start.time) {
        const progress = (this.playhead - start.time) / (end.time - start.time);
        const clampedProgress = Math.max(0, Math.min(1, progress));
        const easedProgress = applyEasing(clampedProgress, start.easing);
        value = interpolateValues(start.value, end.value, easedProgress);
      }

      let nodeUpdates = updates.get(track.nodeId);
      if (!nodeUpdates) {
        nodeUpdates = {};
        updates.set(track.nodeId, nodeUpdates);
      }
      nodeUpdates[track.property] = value;
    }

    if (updates.size > 0) {
      for (const [nodeId, nodeUpdates] of updates.entries()) {
        this.store.updateNode(
          nodeId,
          nodeUpdates as Partial<Record<string, unknown>>,
        );
      }
      this.store.recalculateMatrices();
    }
  }

  private findKeyframeRange(
    sortedKeyframes: Keyframe[],
    time: number,
  ): [Keyframe | null, Keyframe | null] {
    if (sortedKeyframes.length === 0) return [null, null];
    const first = sortedKeyframes[0];
    const last = sortedKeyframes[sortedKeyframes.length - 1];
    if (!first || !last) return [null, null];

    if (time <= first.time) return [first, first];
    if (time >= last.time) return [last, last];

    let low = 0;
    let high = sortedKeyframes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const kMid = sortedKeyframes[mid];
      if (!kMid) break;
      if (kMid.time === time) return [kMid, kMid];
      if (kMid.time < time) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const prev = sortedKeyframes[high] ?? null;
    const next = sortedKeyframes[low] ?? null;
    return [prev, next];
  }
}
