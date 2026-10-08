import type { AnimationEngine } from "@animator/core";
import type { PixiBridge, RenderCanvas } from "./bridge.js";

export interface ExportOptions {
  engine: AnimationEngine;
  bridge: PixiBridge;
  canvas?: RenderCanvas;
  fps?: number; // e.g. 24, 30, 60
  duration?: number; // in milliseconds
  frameCount?: number; // explicit frame count
  onFrame?: (frameIndex: number, frameData: string) => void;
}

export class ExportController {
  private engine: AnimationEngine;
  private bridge: PixiBridge;
  private canvas: RenderCanvas;

  constructor(
    engine: AnimationEngine,
    bridge: PixiBridge,
    canvas?: RenderCanvas,
  ) {
    this.engine = engine;
    this.bridge = bridge;
    this.canvas = canvas || bridge.canvas;
  }

  /**
   * REQUIREMENT 5: Sequences frame stepping, store updates, renderer flushing,
   * and canvas capture into a deterministic synchronous loop.
   */
  public exportFrames(options?: Partial<ExportOptions>): string[] {
    const fps = options?.fps ?? this.engine.getFps() ?? 30;
    const duration = options?.duration ?? this.engine.getDuration();
    const frameDurationMs = 1000 / fps;
    const numFrames =
      options?.frameCount ?? Math.max(1, Math.ceil(duration / frameDurationMs));
    const onFrame = options?.onFrame;

    const initialPlayhead = this.engine.getPlayhead();
    const wasPlaying = this.engine.getIsPlaying();
    const wasOffline = this.engine.isOfflineMode();

    if (wasPlaying) {
      this.engine.pause();
    }

    // Enable offline deterministic mode
    this.engine.setOfflineMode(true);
    this.bridge.setOfflineMode(true);

    const capturedFrames: string[] = [];

    // Synchronous frame export loop
    for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
      // 1. Calculate exact timestamp for this frame
      const targetTimeMs = frameIndex * frameDurationMs;

      // 2. Step animation engine to exact timestamp without 16.67ms rounding drift
      this.engine.seek(targetTimeMs);

      // 3. Synchronously flush renderer display objects from store without microtasks
      this.bridge.flushSync();

      // 4. Force immediate stage compilation and canvas redraw
      this.bridge.renderFrame();

      // 5. Capture canvas frame snapshot
      let frameData = "";
      if (this.canvas && typeof this.canvas.toDataURL === "function") {
        frameData = this.canvas.toDataURL("image/png");
      } else {
        frameData = `frame_${frameIndex}_${targetTimeMs.toFixed(3)}ms`;
      }

      capturedFrames.push(frameData);

      if (onFrame) {
        onFrame(frameIndex, frameData);
      }

      // 6. Release intermediate texture references per frame
      this.bridge.releaseFrameTextures();
    }

    // Restore state
    this.engine.setOfflineMode(wasOffline);
    this.bridge.setOfflineMode(wasOffline);
    this.engine.seek(initialPlayhead);
    if (wasPlaying) {
      this.engine.play();
    }

    return capturedFrames;
  }
}
