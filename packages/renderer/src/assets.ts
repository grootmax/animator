import * as PIXI from 'pixi.js';

export type AssetType = 'image' | 'video';
export type AssetStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AssetMetadata {
  id: string;
  url: string;
  type: AssetType;
  status: AssetStatus;
  texture?: PIXI.Texture;
  refCount: number;
}

export class AssetManager {
  private assets: Map<string, AssetMetadata> = new Map();
  private listeners: Map<string, Set<() => void>> = new Map();

  registerAsset(id: string, url: string, type: AssetType) {
    if (!this.assets.has(id)) {
      this.assets.set(id, { id, url, type, status: 'idle', refCount: 0 });
    }
  }

  getAsset(id: string): AssetMetadata | undefined {
    return this.assets.get(id);
  }

  getAllAssets(): Omit<AssetMetadata, 'texture' | 'refCount' | 'status'>[] {
    return Array.from(this.assets.values()).map(a => ({ id: a.id, url: a.url, type: a.type }));
  }

  async loadAsset(id: string): Promise<PIXI.Texture | undefined> {
    const asset = this.assets.get(id);
    if (!asset) return undefined;

    if (asset.status === 'loaded' && asset.texture) {
      return asset.texture;
    }

    if (asset.status === 'loading') {
      return new Promise((resolve) => {
        const handler = () => {
          if (this.assets.get(id)?.status !== 'loading') {
            this.removeListener(id, handler);
            resolve(this.assets.get(id)?.texture);
          }
        };
        this.addListener(id, handler);
      });
    }

    asset.status = 'loading';
    try {
      if (asset.type === 'video') {
        const video = document.createElement('video');
        video.src = asset.url;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        await new Promise((resolve, reject) => {
          video.oncanplay = resolve;
          video.onerror = reject;
          video.load();
        });

        await video.play().catch(() => {});

        asset.texture = PIXI.Texture.from(video);
      } else {
        asset.texture = await PIXI.Texture.fromURL(asset.url);
      }
      asset.status = 'loaded';
    } catch (err) {
      console.error(`Failed to load asset ${id}`, err);
      asset.status = 'error';
    }
    this.notifyListeners(id);
    return asset.texture;
  }

  acquireAsset(id: string) {
    const asset = this.assets.get(id);
    if (asset) {
      asset.refCount++;
      if (asset.status === 'idle') {
         this.loadAsset(id);
      }
    }
  }

  releaseAsset(id: string) {
    const asset = this.assets.get(id);
    if (asset) {
      asset.refCount--;
      if (asset.refCount <= 0) {
        asset.refCount = 0;
        this.unloadAsset(id);
      }
    }
  }

  private unloadAsset(id: string) {
    const asset = this.assets.get(id);
    if (asset && asset.texture) {
      asset.texture.destroy(true);
      asset.texture = undefined;
      asset.status = 'idle';
    }
  }

  addListener(id: string, cb: () => void) {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }
    this.listeners.get(id)!.add(cb);
  }

  removeListener(id: string, cb: () => void) {
    const set = this.listeners.get(id);
    if (set) {
      set.delete(cb);
    }
  }

  private notifyListeners(id: string) {
    const set = this.listeners.get(id);
    if (set) {
      for (const cb of Array.from(set)) {
        cb();
      }
    }
  }

  clear() {
      for (const id of this.assets.keys()) {
          this.unloadAsset(id);
      }
      this.assets.clear();
      this.listeners.clear();
  }
}

export const assetManager = new AssetManager();
