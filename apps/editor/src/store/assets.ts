import { createStore } from 'zustand/vanilla';
import { v4 as uuidv4 } from 'uuid';

export interface Asset {
  id: string;
  name: string;
  mimeType: string;
  extension: string;
  data: Uint8Array; // Binary payload
  objectUrl: string; // Used for rendering (PIXI or UI previews)
}

export interface AssetRegistryState {
  assets: Record<string, Asset>;
  addAsset: (assetData: Omit<Asset, 'id' | 'objectUrl'>, existingId?: string) => string;
  removeAsset: (id: string) => void;
  clear: () => void;
  cleanupUnusedAssets: (usedAssetIds: string[]) => void;
}

export const createAssetRegistryStore = () => createStore<AssetRegistryState>((set) => ({
  assets: {},

  addAsset: (assetData, existingId) => {
    const id = existingId || uuidv4();
    
    // Create an object URL from the binary data for easy use in PIXI and UI
    const blob = new Blob([assetData.data as any], { type: assetData.mimeType });
    const objectUrl = URL.createObjectURL(blob);
    
    set((state) => ({
      assets: {
        ...state.assets,
        [id]: {
          ...assetData,
          id,
          objectUrl
        }
      }
    }));
    
    return id;
  },

  removeAsset: (id) => {
    set((state) => {
      const asset = state.assets[id];
      if (asset) {
        URL.revokeObjectURL(asset.objectUrl);
        const newAssets = { ...state.assets };
        delete newAssets[id];
        return { assets: newAssets };
      }
      return state;
    });
  },

  clear: () => {
    set((state) => {
      Object.values(state.assets).forEach(asset => URL.revokeObjectURL(asset.objectUrl));
      return { assets: {} };
    });
  },

  cleanupUnusedAssets: (usedAssetIds: string[]) => {
    set((state) => {
      const newAssets = { ...state.assets };
      const usedSet = new Set(usedAssetIds);
      let changed = false;

      for (const [id, asset] of Object.entries(newAssets)) {
        if (!usedSet.has(id)) {
          URL.revokeObjectURL(asset.objectUrl);
          delete newAssets[id];
          changed = true;
        }
      }

      return changed ? { assets: newAssets } : state;
    });
  }
}));
