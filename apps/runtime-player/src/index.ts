import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { ProjectValidator } from '@monorepo/serialization';

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
    let data: ExportedProject;
    if (typeof json === 'string') {
      try {
        data = ProjectValidator.validateString(json) as ExportedProject;
      } catch (e: any) {
        throw new Error(e.message || 'Invalid JSON');
      }
    } else {
      try {
        ProjectValidator.validateStructure(json);
        data = json;
      } catch (e: any) {
        throw new Error(e.message || 'Invalid Project Structure');
      }
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
}
