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

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
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
    this.engine.play();
  }

  public pause() {
    this.engine.pause();
  }

  public seek(time: number) {
    this.engine.seek(time);
  }

  public setViewport(transform: { x: number; y: number; scaleX: number; scaleY: number }) {
    if ((this.bridge as any).viewport) {
      const vp = (this.bridge as any).viewport;
      vp.container.x = transform.x;
      vp.container.y = transform.y;
      vp.container.scale.x = transform.scaleX;
      vp.container.scale.y = transform.scaleY;
      vp.drawGrid();
    }
  }
}
