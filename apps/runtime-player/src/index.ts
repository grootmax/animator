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
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const offscreen = canvas.transferControlToOffscreen();
    this.worker.postMessage({ type: 'INIT', canvas: offscreen }, [offscreen]);
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

    if (data.scene) {
      const updates = Object.values(data.scene).map(n => ({ type: 'ADD', node: n }));
      this.worker.postMessage({ type: 'BATCH_UPDATE', updates });
    }

    if (data.metadata?.duration) {
      // We don't have explicit setDuration on the worker right now but we can assume tracks cover it
    }

    if (data.animations) {
      data.animations.forEach(track => {
        this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'addTrack', track });
      });
    }
  }

  public play() {
    this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'play' });
  }

  public pause() {
    this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'pause' });
  }
}
