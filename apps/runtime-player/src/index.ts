import { SceneNode } from '@monorepo/scene-graph';
import { Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export class RuntimePlayer {
  private worker: Worker;
  private sharedBuffer: SharedArrayBuffer;
  private syncArray: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    // SharedArrayBuffer for node state sync (up to 100k nodes * 16 floats per node)
    this.sharedBuffer = new SharedArrayBuffer(100000 * 16 * 4);
    this.syncArray = new Float32Array(this.sharedBuffer);

    let offscreen: OffscreenCanvas | HTMLCanvasElement = canvas;
    if ('transferControlToOffscreen' in canvas) {
      offscreen = canvas.transferControlToOffscreen();
    }

    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.postMessage({
      type: 'init',
      payload: { canvas: offscreen, sharedBuffer: this.sharedBuffer }
    }, offscreen instanceof OffscreenCanvas ? [offscreen] : []);

    // Proxy viewport events to the worker
    canvas.addEventListener('pointerdown', (e) => this.proxyEvent('pointerdown', e));
    canvas.addEventListener('pointermove', (e) => this.proxyEvent('pointermove', e));
    canvas.addEventListener('pointerup', (e) => this.proxyEvent('pointerup', e));
  }

  private proxyEvent(type: string, e: PointerEvent) {
    this.worker.postMessage({
      type: 'interaction',
      payload: {
        eventType: type,
        eventData: { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId }
      }
    });
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
      type: 'load',
      payload: { data }
    });
  }

  public play() {
    this.worker.postMessage({ type: 'play' });
  }

  public pause() {
    this.worker.postMessage({ type: 'pause' });
  }

  public seek(time: number) {
    this.worker.postMessage({ type: 'seek', payload: { time } });
  }

  public updateNode(id: string, updates: any) {
    this.worker.postMessage({ type: 'updateNode', payload: { id, updates } });
  }
}
