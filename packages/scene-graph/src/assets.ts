import { createStore } from 'zustand/vanilla';

export type AssetType = 'image' | 'video' | string;

export interface Asset {
  id: string;
  type: AssetType;
  name?: string;
  src?: string;
  data?: ArrayBuffer | Blob;
  url?: string; // Object URL for runtime display
  status?: 'loading' | 'ready' | 'error';
  loaded?: boolean;
  element?: HTMLImageElement | HTMLVideoElement;
}

export interface AssetRegistryState {
  assets: Record<string, Asset>;
  addAsset: (asset: Omit<Asset, 'url' | 'status'> & Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  getAsset: (id: string) => Asset | undefined;
  loadAsset: (id: string, type: AssetType, name: string, file: File | Blob) => Promise<void>;
}

export const createAssetRegistryStore = () => createStore<AssetRegistryState>((set, get) => ({
  assets: {},

  addAsset: (asset) => {
    // Generate object URL for binary data if provided
    let url = asset.url || '';
    if (!url && asset.data) {
      const blob = asset.data instanceof Blob ? asset.data : new Blob([asset.data]);
      url = URL.createObjectURL(blob);
    }
    
    set((state) => ({
      assets: {
        ...state.assets,
        [asset.id]: {
          ...asset,
          url,
          status: asset.status || 'ready'
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
