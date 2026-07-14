import { createStore } from 'zustand/vanilla';

export interface Asset {
  id: string;
  name: string;
  type: 'image'; // we can expand this to video, audio, etc. later
  hash: string;
  url: string; // The object URL or data URI representing the asset for the browser
  width?: number;
  height?: number;
}

export interface AssetRegistryState {
  assets: Record<string, Asset>;
  hashToId: Record<string, string>;
  
  // Actions
  addAsset: (file: File) => Promise<string>;
  removeAsset: (id: string) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
}

// Simple hash generator for deduplication (since we shouldn't import crypto here)
// Or we can use file properties for a quick hash: name + size + lastModified
const generateFileHash = async (file: File): Promise<string> => {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback if crypto isn't available
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
};

export const createAssetRegistry = () => createStore<AssetRegistryState>((set, get) => ({
  assets: {},
  hashToId: {},

  addAsset: async (file: File) => {
    const hash = await generateFileHash(file);
    const state = get();

    // Deduplication check
    if (state.hashToId[hash]) {
      return state.hashToId[hash];
    }

    const id = `asset_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const url = URL.createObjectURL(file);
    
    // Attempt to get image dimensions
    let width = 0;
    let height = 0;
    
    if (file.type.startsWith('image/')) {
      try {
        const img = new Image();
        img.src = url;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        width = img.width;
        height = img.height;
      } catch (e) {
        // Ignore error
      }
    }

    const newAsset: Asset = {
      id,
      name: file.name,
      type: 'image',
      hash,
      url,
      width,
      height
    };

    set((s) => ({
      assets: { ...s.assets, [id]: newAsset },
      hashToId: { ...s.hashToId, [hash]: id }
    }));

    return id;
  },

  removeAsset: (id: string) => {
    set((state) => {
      const asset = state.assets[id];
      if (!asset) return state;

      const newAssets = { ...state.assets };
      delete newAssets[id];

      const newHashToId = { ...state.hashToId };
      delete newHashToId[asset.hash];

      // Clean up object URL
      URL.revokeObjectURL(asset.url);

      return {
        assets: newAssets,
        hashToId: newHashToId
      };
    });
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
  }
}));
