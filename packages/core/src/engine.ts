import { createInitialMotionState, motionPatchReducer } from "./reducer.js";
import type { MotionDoc, MotionPatch, MotionState } from "./types.js";

export type StateListener = (state: MotionState, patch: MotionPatch) => void;

export class AnimationEngine {
  private state: MotionState;
  private listeners: Set<StateListener> = new Set();
  private timerId: ReturnType<typeof setInterval> | number | null = null;
  private animationFrameId: number | null = null;
  private lastTickTime = 0;
  private useRafIfAvailable = true;

  constructor(initialDoc: MotionDoc) {
    this.state = createInitialMotionState(initialDoc);
  }

  public getState(): MotionState {
    return this.state;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispatch(patch: MotionPatch): MotionPatch {
    this.state = motionPatchReducer(this.state, patch);
    for (const listener of this.listeners) {
      try {
        listener(this.state, patch);
      } catch (err) {
        console.error("Error in AnimationEngine subscriber:", err);
      }
    }
    return patch;
  }

  public play(): void {
    if (this.state.isPlaying) return;
    this.dispatch({ type: "SET_PLAYING", isPlaying: true });
    this.startMasterClock();
  }

  public pause(): void {
    if (!this.state.isPlaying) return;
    this.stopMasterClock();
    this.dispatch({ type: "SET_PLAYING", isPlaying: false });
  }

  public seek(playhead: number): void {
    this.dispatch({ type: "SET_PLAYHEAD", playhead });
  }

  public tick(deltaTime: number): MotionPatch {
    const patch: MotionPatch = { type: "TICK", deltaTime };
    return this.dispatch(patch);
  }

  public setDoc(doc: MotionDoc): void {
    this.dispatch({ type: "SET_DOC", doc });
  }

  private startMasterClock(): void {
    this.lastTickTime = this.getHighResTime();

    if (
      this.useRafIfAvailable &&
      typeof requestAnimationFrame !== "undefined"
    ) {
      const loop = () => {
        if (!this.state.isPlaying) return;
        const now = this.getHighResTime();
        const dt = Math.max(0, (now - this.lastTickTime) / 1000);
        this.lastTickTime = now;
        this.tick(dt);
        this.animationFrameId = requestAnimationFrame(loop);
      };
      this.animationFrameId = requestAnimationFrame(loop);
    } else {
      // Virtualized high-resolution timer fallback for workers or non-RAF environments
      const fps = this.state.fps || 30;
      const intervalMs = Math.max(1, 1000 / fps);
      this.timerId = setInterval(() => {
        if (!this.state.isPlaying) return;
        const now = this.getHighResTime();
        const dt = Math.max(0, (now - this.lastTickTime) / 1000);
        this.lastTickTime = now;
        this.tick(dt);
      }, intervalMs) as unknown as number;
    }
  }

  private stopMasterClock(): void {
    if (
      this.animationFrameId !== null &&
      typeof cancelAnimationFrame !== "undefined"
    ) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.timerId !== null) {
      clearInterval(this.timerId as unknown as number);
      this.timerId = null;
    }
  }

  private getHighResTime(): number {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
    return Date.now();
  }

  public dispose(): void {
    this.stopMasterClock();
    this.listeners.clear();
  }
}
