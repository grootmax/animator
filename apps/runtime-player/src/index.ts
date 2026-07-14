import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export class RuntimePlayer {
  private store: ReturnType<typeof createSceneGraphStore>;
  private engine: AnimationEngine;
  private bridge: PixiBridge;
  private rafId: number | null = null;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.store = createSceneGraphStore();
    this.engine = new AnimationEngine(this.store);
    this.bridge = new PixiBridge(canvas, this.store);
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
      data.animations.forEach(track => {
        this.engine.addTrack(track);
      });
    }
  }

  public play() {
    if (this.engine.getIsPlaying()) return;
    this.engine.play();
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  public pause() {
    this.engine.pause();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = () => {
    if (!this.engine.getIsPlaying()) return;

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.engine.step(dt);

    if (this.engine.getIsPlaying()) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }
}
