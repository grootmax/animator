import { createSceneGraphStore, createAssetRegistryStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

export interface ExportedProject {
  scene: Record<string, Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>>;
  animations: Track[];
  assets?: Record<string, { id: string, type: 'image' | 'video', name: string }>;
  metadata: any;
}

export class RuntimePlayer {
  private store: ReturnType<typeof createSceneGraphStore>;
  private assetRegistry: ReturnType<typeof createAssetRegistryStore>;
  private engine: AnimationEngine;
  private bridge: PixiBridge;

  constructor(canvas: HTMLCanvasElement) {
    this.store = createSceneGraphStore();
    this.assetRegistry = createAssetRegistryStore();
    this.engine = new AnimationEngine(this.store);
    this.bridge = new PixiBridge(canvas, this.store, this.assetRegistry);
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

    // Load assets first (just metadata, in a real player we'd fetch the binary from URL)
    if (data.assets) {
      for (const [id, assetMeta] of Object.entries(data.assets)) {
        // Here we just add it with a dummy ArrayBuffer because we don't have the binary. 
        // Real implementation would fetch the binary from a server based on `id`
        this.assetRegistry.getState().addAsset({
          id,
          type: assetMeta.type,
          name: assetMeta.name,
          data: new ArrayBuffer(0)
        });
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
