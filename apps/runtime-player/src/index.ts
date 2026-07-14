import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { createAssetRegistry, Asset } from '@monorepo/assets';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  assets?: Record<string, Asset>;
  animations: Track[];
  metadata: any;
}

export class RuntimePlayer {
  private store: ReturnType<typeof createSceneGraphStore>;
  private assetStore: ReturnType<typeof createAssetRegistry>;
  private engine: AnimationEngine;
  private bridge: PixiBridge;

  constructor(canvas: HTMLCanvasElement) {
    this.store = createSceneGraphStore();
    this.assetStore = createAssetRegistry();
    this.engine = new AnimationEngine(this.store);
    this.bridge = new PixiBridge(canvas, this.store, this.assetStore);
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

    // Load assets
    if (data.assets) {
      Object.entries(data.assets).forEach(([id, asset]) => {
        // We only have the serialized asset, but for playback we might not be able to easily
        // re-create the data URL unless it was embedded or fetched. Assuming the system
        // provides real URLs or dataURIs for playback via updateAsset later, or embedded in JSON.
        this.assetStore.getState().assets[id] = asset;
      });
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
