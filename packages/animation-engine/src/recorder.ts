import { AnimationEngine } from './engine';

export interface RecorderOptions {
  engine: AnimationEngine;
  canvas: HTMLCanvasElement;
  fps?: number;
  duration?: number;
  onFrame?: (frameIndex: number, dataUrl: string) => void;
  renderTrigger?: () => void; // Optional hook for forcing synchronous rendering
}

export class Recorder {
  private engine: AnimationEngine;
  private canvas: HTMLCanvasElement;
  private fps: number;
  private duration: number;
  private onFrame?: (frameIndex: number, dataUrl: string) => void;
  private renderTrigger?: () => void;

  constructor(options: RecorderOptions) {
    this.engine = options.engine;
    this.canvas = options.canvas;
    this.fps = options.fps || 60;
    this.duration = options.duration ?? this.engine.getDuration();
    this.onFrame = options.onFrame;
    this.renderTrigger = options.renderTrigger;
  }

  public async captureSequence(): Promise<string[]> {
    const dataUrls: string[] = [];
    const stepSize = 1000 / this.fps;
    const numFrames = Math.ceil(this.duration / stepSize);

    const initialPlayhead = this.engine.getPlayhead();
    const wasPlaying = this.engine.getIsPlaying();
    
    if (wasPlaying) {
      this.engine.pause();
    }

    for (let i = 0; i < numFrames; i++) {
      const time = i * stepSize;
      
      // Step deterministically
      this.engine.seek(time);

      if (this.renderTrigger) {
        this.renderTrigger();
      } else {
        // Wait for the renderer to process the updated state 
        // by waiting for double requestAnimationFrame to ensure drawing happened.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }

      // Extract the snapshot
      const dataUrl = this.canvas.toDataURL('image/png');
      dataUrls.push(dataUrl);

      if (this.onFrame) {
        this.onFrame(i, dataUrl);
      }
    }

    // Restore state
    this.engine.seek(initialPlayhead);
    if (wasPlaying) {
      this.engine.play();
    }

    return dataUrls;
  }
}
