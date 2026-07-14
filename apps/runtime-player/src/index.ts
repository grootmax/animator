import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export class RuntimePlayer {
  private worker?: Worker;
  
  // Fallback properties
  private store?: ReturnType<typeof createSceneGraphStore>;
  private engine?: AnimationEngine;
  private bridge?: PixiBridge;

  constructor(canvas: HTMLCanvasElement) {
    const supportsOffscreen = 'OffscreenCanvas' in window && typeof canvas.transferControlToOffscreen === 'function';

    if (supportsOffscreen) {
      try {
        const offscreen = canvas.transferControlToOffscreen();
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        
        this.worker.postMessage({
          type: 'INIT',
          payload: {
            canvas: offscreen,
            width: canvas.clientWidth || 800,
            height: canvas.clientHeight || 600,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        }, [offscreen]);

        this.bindCanvasEvents(canvas);
      } catch (e) {
        console.warn('Worker initialization failed, falling back to main thread:', e);
        this.initMainThread(canvas);
      }
    } else {
      this.initMainThread(canvas);
    }
  }

  private initMainThread(canvas: HTMLCanvasElement) {
    this.store = createSceneGraphStore();
    this.engine = new AnimationEngine(this.store);
    this.bridge = new PixiBridge({
      canvas: canvas,
      width: canvas.clientWidth || 800,
      height: canvas.clientHeight || 600,
      devicePixelRatio: window.devicePixelRatio || 1,
      resizeTo: window
    }, this.store);
  }

  private bindCanvasEvents(canvas: HTMLCanvasElement) {
    const forwardEvent = (e: any) => {
      if (!this.worker) return;
      const rect = canvas.getBoundingClientRect();
      const eventData = {
        clientX: e.clientX,
        clientY: e.clientY,
        globalX: e.clientX - rect.left,
        globalY: e.clientY - rect.top,
        button: e.button,
        shiftKey: e.shiftKey,
        deltaY: e.deltaY,
      };
      
      this.worker.postMessage({
        type: 'DOM_EVENT',
        payload: { eventName: e.type, eventData }
      });
    };

    canvas.addEventListener('pointerdown', forwardEvent);
    canvas.addEventListener('pointermove', forwardEvent);
    window.addEventListener('pointerup', forwardEvent);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      forwardEvent(e);
    }, { passive: false });
  }

  public resize(width: number, height: number) {
     if (this.worker) {
         this.worker.postMessage({ type: 'RESIZE', payload: { width, height } });
     } else if (this.bridge) {
         this.bridge.resize(width, height);
     }
  }

  public updateNode(nodeId: string, updates: Partial<SceneNode>) {
      if (this.worker) {
          this.worker.postMessage({ type: 'UPDATE_NODE', payload: { nodeId, updates } });
      } else if (this.store) {
          this.store.getState().updateNode(nodeId, updates);
          this.store.getState().recalculateMatrices();
      }
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

    if (this.worker) {
      this.worker.postMessage({ type: 'LOAD', payload: data });
    } else if (this.store && this.engine) {
      if (data.scene) {
        Object.values(data.scene).forEach(node => {
          this.store!.getState().addNode(node as any);
        });
        this.store!.getState().recalculateMatrices();
      }
      if (data.metadata?.duration) {
        this.engine.setDuration(data.metadata.duration);
      }
      if (data.animations) {
        data.animations.forEach(track => {
          this.engine!.addTrack(track);
        });
      }
    }
  }

  public play() {
    if (this.worker) {
      this.worker.postMessage({ type: 'PLAY' });
    } else if (this.engine) {
      this.engine.play();
    }
  }

  public pause() {
    if (this.worker) {
      this.worker.postMessage({ type: 'PAUSE' });
    } else if (this.engine) {
      this.engine.pause();
    }
  }
}
