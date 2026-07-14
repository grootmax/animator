import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { ExportedProjectSchema } from '@monorepo/serialization';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  metadata: any;
}

export class RuntimePlayer {
  private store: ReturnType<typeof createSceneGraphStore>;
  private engine: AnimationEngine;
  private bridge: PixiBridge;

  constructor(canvas: HTMLCanvasElement) {
    this.store = createSceneGraphStore();
    this.engine = new AnimationEngine(this.store);
    this.bridge = new PixiBridge(canvas, this.store);
  }

  public load(json: string | ExportedProject) {
    let data: any;
    if (typeof json === 'string') {
      try {
        data = JSON.parse(json);
      } catch (e) {
        throw new Error('Invalid JSON');
      }
    } else {
      data = json;
    }

    const validationResult = ExportedProjectSchema.safeParse(data);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${validationResult.error.message}`);
    }
    const validData = validationResult.data;

    // Load scene
    if (validData.scene) {
      Object.values(validData.scene).forEach(node => {
        this.store.getState().addNode(node as any);
      });
      this.store.getState().recalculateMatrices();
    }

    // Load metadata and animations
    if (validData.metadata?.duration) {
      this.engine.setDuration(validData.metadata.duration);
    }

    if (validData.animations) {
      validData.animations.forEach(track => {
        this.engine.addTrack(track as any);
      });
    }
  }

  public play() {
    this.engine.play();
  }

  public pause() {
    this.engine.pause();
  }
}
