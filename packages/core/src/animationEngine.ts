import type {
  AnimationTrack,
  Keyframe,
  Layer,
  MotionDocument,
} from "./types.js";

export function sampleTrack(
  track: AnimationTrack,
  time: number,
): number | number[] | string | undefined {
  const kfs = track.keyframes;
  if (!kfs || kfs.length === 0) return undefined;

  // Sort keyframes by time just in case
  const sorted = [...kfs].sort((a, b) => a.t - b.t);

  const firstKf = sorted[0];
  const lastKf = sorted[sorted.length - 1];

  if (!firstKf || !lastKf) return undefined;

  if (time <= firstKf.t) return firstKf.v;
  if (time >= lastKf.t) return lastKf.v;

  for (let i = 0; i < sorted.length - 1; i++) {
    const kf1 = sorted[i];
    const kf2 = sorted[i + 1];
    if (kf1 && kf2 && time >= kf1.t && time <= kf2.t) {
      const dt = kf2.t - kf1.t;
      if (dt === 0) return kf1.v;
      const progress = (time - kf1.t) / dt;

      return interpolateValues(kf1.v, kf2.v, progress);
    }
  }

  return lastKf.v;
}

function interpolateValues(
  v1: number | number[] | string,
  v2: number | number[] | string,
  progress: number,
): number | number[] | string {
  if (typeof v1 === "number" && typeof v2 === "number") {
    return v1 + (v2 - v1) * progress;
  }
  if (Array.isArray(v1) && Array.isArray(v2) && v1.length === v2.length) {
    return v1.map((val, idx) => {
      const num2 = v2[idx];
      return typeof val === "number" && typeof num2 === "number"
        ? val + (num2 - val) * progress
        : val;
    });
  }
  return progress < 0.5 ? v1 : v2;
}

export class AnimationEngine {
  private document: MotionDocument | null = null;
  private listeners: Set<() => void> = new Set();
  private currentTime = 0;

  constructor(document?: MotionDocument) {
    if (document) {
      this.document = document;
    }
  }

  public setDocument(doc: MotionDocument): void {
    this.document = doc;
    this.notify();
  }

  public getDocument(): MotionDocument | null {
    return this.document;
  }

  public setCurrentTime(time: number): void {
    this.currentTime = time;
    this.notify();
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public evaluateLayer(
    layerId: string,
    time = this.currentTime,
  ): {
    isActive: boolean;
    properties: Record<string, number | number[] | string | undefined>;
  } {
    if (!this.document) {
      return { isActive: false, properties: {} };
    }

    const layer = this.document.layers.find((l) => l.id === layerId);
    if (!layer) {
      return { isActive: false, properties: {} };
    }

    const isActive = time >= layer.in && time <= layer.out;
    const properties: Record<string, number | number[] | string | undefined> =
      {};

    for (const [prop, track] of Object.entries(layer.tracks || {})) {
      properties[prop] = sampleTrack(track, time);
    }

    return { isActive, properties };
  }
}
