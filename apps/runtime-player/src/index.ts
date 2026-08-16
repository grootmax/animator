import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export class InnerRuntimePlayer {
  public store: ReturnType<typeof createSceneGraphStore>;
  public engine: AnimationEngine;
  private bridge: PixiBridge;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, devicePixelRatio?: number) {
    this.store = createSceneGraphStore();
    this.engine = new AnimationEngine(this.store);
    this.bridge = new PixiBridge(canvas, this.store, devicePixelRatio);
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
      Object.values(data.scene).forEach(node => {
        this.store.getState().addNode(node as any);
      });
      this.store.getState().recalculateMatrices();
    }

    if (data.metadata?.duration) {
      this.engine.setDuration(data.metadata.duration);
    }

    if (data.animations) {
      data.animations.forEach(track => {
        this.engine.addTrack(track);
      });
    }
  }

  public play() {
    this.engine.play();
  }

  public pause() {
    this.engine.pause();
  }

  public seek(time: number) {
    // Assuming engine has seek, otherwise we just set time
    if (typeof (this.engine as any).seek === 'function') {
      (this.engine as any).seek(time);
    }
  }

  public resize(width: number, height: number) {
    if (this.bridge && this.bridge.app) {
      this.bridge.app.renderer.resize(width, height);
    }
  }

  public updateNode(id: string, updates: any) {
    this.store.getState().updateNode(id, updates);
  }

  public addNode(node: any) {
    this.store.getState().addNode(node);
    this.store.getState().recalculateMatrices();
  }

  public addTrack(track: any) {
    this.engine.addTrack(track);
  }
}

export class RuntimePlayer {
  private worker: Worker | null = null;
  private fallbackPlayer: InnerRuntimePlayer | null = null;
  private subscribers: Array<(nodes: Record<string, SceneNode>) => void> = [];

  // Local state for Timeline UI
  private playhead = 0;
  private isPlaying = false;
  private duration = 5000;
  private tracks: Track[] = [];
  private lastTime = 0;
  private rafId: number | null = null;

  public getPlayhead() { return this.playhead; }
  public getIsPlaying() { return this.isPlaying; }
  public getDuration() { return this.duration; }
  public getTracks() { return this.tracks; }

  constructor(canvas: HTMLCanvasElement) {
    const supportsOffscreen = typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';

    if (supportsOffscreen) {
      const offscreen = canvas.transferControlToOffscreen();
      this.worker = new Worker(new URL('../src/player.worker.ts', import.meta.url), { type: 'module' });
      
      this.worker.onmessage = (e) => {
        if (e.data.type === 'STATE_SYNC') {
          const buffer = e.data.payload as ArrayBuffer;
          const decoder = new TextDecoder();
          const json = decoder.decode(buffer);
          try {
            const nodes = JSON.parse(json);
            this.notifySubscribers(nodes);
          } catch (e) {}
        }
      };

      this.worker.postMessage({
        type: 'INIT',
        payload: {
          canvas: offscreen,
          width: canvas.clientWidth || 800,
          height: canvas.clientHeight || 600,
          devicePixelRatio: window.devicePixelRatio || 1
        }
      }, [offscreen]);
    } else {
      this.fallbackPlayer = new InnerRuntimePlayer(canvas, window.devicePixelRatio || 1);
      this.fallbackPlayer.store.subscribe((state) => {
        this.notifySubscribers(state.nodes);
      });
    }
  }

  public subscribe(callback: (nodes: Record<string, SceneNode>) => void) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notifySubscribers(nodes: Record<string, SceneNode>) {
    this.subscribers.forEach(cb => cb(nodes));
  }

  public load(json: string | ExportedProject) {
    if (this.worker) {
      this.worker.postMessage({ type: 'LOAD', payload: { json } });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.load(json);
    }
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTime = performance.now();
    this.tick();

    if (this.worker) {
      this.worker.postMessage({ type: 'PLAY', payload: {} });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.play();
    }
  }

  public pause() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.worker) {
      this.worker.postMessage({ type: 'PAUSE', payload: {} });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.pause();
    }
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.playhead += dt;

    if (this.playhead > this.duration) {
      this.playhead = this.playhead % this.duration;
    }

    if (this.isPlaying) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  public seek(time: number) {
    this.playhead = time;
    if (this.worker) {
      this.worker.postMessage({ type: 'SEEK', payload: { time } });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.seek(time);
    }
  }

  public resize(width: number, height: number) {
    if (this.worker) {
      this.worker.postMessage({ type: 'RESIZE', payload: { width, height } });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.resize(width, height);
    }
  }
  
  public updateNode(id: string, updates: any) {
    if (this.worker) {
      this.worker.postMessage({ type: 'UPDATE_NODE', payload: { id, updates } });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.updateNode(id, updates);
    }
  }

  public addNode(node: any) {
    if (this.worker) {
      this.worker.postMessage({ type: 'ADD_NODE', payload: { node } });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.addNode(node);
    }
  }

  public addTrack(track: any) {
    this.tracks.push(track);
    if (this.worker) {
      this.worker.postMessage({ type: 'ADD_TRACK', payload: { track } });
    } else if (this.fallbackPlayer) {
      this.fallbackPlayer.addTrack(track);
    }
  }
  
  public terminate() {
    this.pause();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
