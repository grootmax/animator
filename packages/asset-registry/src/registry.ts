import { createStore } from 'zustand/vanilla';

export type AssetStatus = 'linked' | 'missing' | 'loading' | 'error';
export type AssetType = 'image' | 'video' | 'unknown';

export interface Asset {
  id: string;
  path: string; // Absolute or relative path to the asset on disk
  timestamp: number; // Last modified time
  status: AssetStatus;
  type: AssetType;
  fileSize?: number;
  // This url will be a localized URL or a blob URL that the renderer can use
  url?: string;
}

export interface AssetRegistryState {
  assets: Record<string, Asset>;
  registerAsset: (asset: Omit<Asset, 'status'>) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  markMissing: (id: string) => void;
  // This could trigger a re-link or something in the actual app
  // For now, it just tracks state
}

export const createAssetRegistry = () => createStore<AssetRegistryState>((set, get) => ({
  assets: {},

  registerAsset: (asset) => {
    set((state) => ({
      assets: {
        ...state.assets,
        [asset.id]: {
          ...asset,
          status: 'linked'
        }
      }
    }));
  },

  updateAsset: (id, updates) => {
    set((state) => {
      const asset = state.assets[id];
      if (!asset) return state;
      return {
        assets: {
          ...state.assets,
          [id]: { ...asset, ...updates }
        }
      };
    });
  },

  removeAsset: (id) => {
    set((state) => {
      const newAssets = { ...state.assets };
      delete newAssets[id];
      return { assets: newAssets };
    });
  },

  markMissing: (id) => {
    set((state) => {
      const asset = state.assets[id];
      if (!asset) return state;
      return {
        assets: {
          ...state.assets,
          [id]: { ...asset, status: 'missing' }
        }
      };
    });
  }
}));
