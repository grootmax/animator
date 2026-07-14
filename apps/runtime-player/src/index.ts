import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge, RendererConfig } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export interface RuntimePlayerConfig {
  canvas: any;
  width: number;
  height: number;
  resolution: number;
  backgroundColor?: number;
}

export class RuntimePlayer {
  public store: ReturnType<typeof createSceneGraphStore>;
  public engine: AnimationEngine;
  public renderer: PixiBridge;

  private isDestroyed = false;
  private rafId: number | null = null;
  private lastTime = 0;

  constructor(config: RuntimePlayerConfig) {
    this.store = createSceneGraphStore();
    this.engine = new AnimationEngine(this.store);
    this.renderer = new PixiBridge(config, this.store);
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

    // Load scene
    if (data.scene) {
      Object.values(data.scene).forEach(node => {
        this.store.getState().addNode(node as any);
      });
      this.store.getState().recalculateMatrices();
    }

    // Load metadata and animations
    if (data.metadata?.duration) {
      this.engine.setDuration(data.metadata.duration);
    }

    if (data.animations) {
      this.engine.setTracks(data.animations);
    }
  }

  // Playback Control API
  public play() {
    if (this.engine.getIsPlaying()) return;
    this.engine.play();
    this.lastTime = performance.now();
    this.startLoop();
  }

  public pause() {
    this.engine.pause();
    this.stopLoop();
  }

  public seek(time: number) {
    this.engine.seek(time);
  }

  public setTracks(tracks: Track[]) {
    this.engine.setTracks(tracks);
  }

  public getTracks() {
    return this.engine.getTracks();
  }

  public getDuration() {
    return this.engine.getDuration();
  }

  public getIsPlaying() {
    return this.engine.getIsPlaying();
  }

  public getStore() {
    return this.store;
  }

  // Lifecycle
  public tick(dt: number) {
    if (this.isDestroyed) return;
    this.engine.tick(dt);
    this.renderer.handles.update();
  }

  private startLoop() {
    if (this.rafId !== null) return;
    const loop = (now: number) => {
      const dt = now - this.lastTime;
      this.lastTime = now;
      this.tick(dt);
      
      if (this.engine.getIsPlaying()) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.stopLoop();
  }

  public resize(width: number, height: number, resolution?: number) {
    this.renderer.resize(width, height, resolution);
  }

  // Input injection API
  public emitPointerDown(e: any) {
    this.renderer.viewport.onPointerDown(e);
  }
  
  public emitPointerMove(e: any) {
    this.renderer.viewport.onPointerMove(e);
    this.renderer.handles.onPointerMove(e);
  }
  
  public emitPointerUp(e: any) {
    this.renderer.viewport.onPointerUp();
    this.renderer.handles.onPointerUp();
  }

  public emitWheel(e: any) {
    this.renderer.viewport.onWheel(e);
  }
}
