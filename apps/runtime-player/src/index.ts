import { SceneNode } from '@monorepo/scene-graph';
import { Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export class RuntimePlayer {
  private worker: Worker;

  constructor(canvas: HTMLCanvasElement) {
    // Create the worker
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    
    // Transfer control to offscreen
    const offscreen = canvas.transferControlToOffscreen();
    
    this.worker.postMessage({
      type: 'INIT',
      payload: { canvas: offscreen }
    }, [offscreen]);
  }

  public load(json: string | ExportedProject) {
    let data: ExportedProject;
    if (typeof json === 'string') {
      try {
        data = JSON.parse(json);
      } catch (e) {
        throw new Error('Invalid JSON');
      }
    } else {
      data = json;
    }

    this.worker.postMessage({
      type: 'LOAD',
      payload: data
    });
  }

  public play() {
    this.worker.postMessage({ type: 'PLAY' });
  }

  public pause() {
    this.worker.postMessage({ type: 'PAUSE' });
  }

  public seek(time: number) {
    this.worker.postMessage({ type: 'SEEK', payload: { time } });
  }

  public destroy() {
    this.worker.postMessage({ type: 'DESTROY' });
    this.worker.terminate();
  }
}
