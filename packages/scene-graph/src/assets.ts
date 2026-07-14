import { createStore } from 'zustand/vanilla';

export type AssetType = 'image' | 'video' | 'path';

export interface Asset {
  id: string;
  type: AssetType;
  name?: string;
  data: any; // ArrayBuffer | Blob | string;
  url?: string; // Object URL for runtime display
  status?: 'loading' | 'ready' | 'error';
}

export interface AssetRegistryState {
  assets: Record<string, Asset>;
  addAsset: (asset: Omit<Asset, 'url' | 'status'>) => void;
  removeAsset: (id: string) => void;
  getAsset: (id: string) => Asset | undefined;
  loadAsset: (id: string, type: AssetType, name: string, file: File | Blob) => Promise<void>;
}

export const createAssetRegistryStore = () => createStore<AssetRegistryState>((set, get) => ({
  assets: {},

  addAsset: (asset) => {
    // Generate object URL for binary data to be used in renderer
    const blob = asset.data instanceof Blob ? asset.data : typeof asset.data === 'string' ? new Blob([asset.data]) : new Blob([asset.data]);
    const url = URL.createObjectURL(blob);
    
    set((state) => ({
      assets: {
        ...state.assets,
        [asset.id]: {
          ...asset,
          url,
          status: 'ready'
        }
      }
    }));
  },

  loadAsset: async (id, type, name, file) => {
    // Initially set status to loading
    set((state) => ({
      assets: {
        ...state.assets,
        [id]: {
          id,
          type,
          name,
          data: file,
          url: '',
          status: 'loading'
        }
      }
    }));

    // Simulate async processing (e.g. reading file or generating texture)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = URL.createObjectURL(file);
        set((state) => ({
          assets: {
            ...state.assets,
            [id]: {
              ...state.assets[id],
              data: reader.result as ArrayBuffer,
              url,
              status: 'ready'
            }
          }
        }));
        resolve();
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  removeAsset: (id) => {
    set((state) => {
      const newAssets = { ...state.assets };
      const asset = newAssets[id];
      if (asset && asset.url) {
        URL.revokeObjectURL(asset.url);
      }
      delete newAssets[id];
      return { assets: newAssets };
    });
  },

  getAsset: (id) => get().assets[id]
}));

export class AssetRegistry {
  private assets: Map<string, Asset> = new Map();
  private listeners: Set<(event: { type: 'add' | 'remove', id?: string }) => void> = new Set();

  registerAsset(asset: Asset): void {
    this.assets.set(asset.id, asset);
    this.notify({ type: 'add', id: asset.id });
  }

  registerAssets(assets: Asset[]): void {
    for (const asset of assets) {
      this.assets.set(asset.id, asset);
    }
    this.notify({ type: 'add' }); // atomic update
  }

  getAsset(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  removeAsset(id: string): void {
    this.assets.delete(id);
    this.notify({ type: 'remove', id });
  }

  subscribe(listener: (event: { type: 'add' | 'remove', id?: string }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: { type: 'add' | 'remove', id?: string }) {
    this.listeners.forEach((l) => l(event));
  }

  getAllAssets(): Asset[] {
    return Array.from(this.assets.values());
  }
}

export const globalAssetRegistry = new AssetRegistry();
