import { createStore } from "zustand/vanilla";

export type AssetType = "image" | "video" | string;

export interface Asset {
  id: string;
  type: AssetType;
  name?: string;
  src?: string;
  data?: ArrayBuffer | Blob;
  url?: string;
  status?: "loading" | "ready" | "error";
  element?: HTMLImageElement | HTMLVideoElement;
}

export interface AssetRegistryState {
  assets: Record<string, Asset>;
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  getAsset: (id: string) => Asset | undefined;
}

export const createAssetRegistryStore = () =>
  createStore<AssetRegistryState>((set, get) => ({
    assets: {},
    addAsset: (asset) =>
      set((state) => ({
        assets: {
          ...state.assets,
          [asset.id]: {
            ...asset,
            status: asset.status || "ready",
          },
        },
      })),
    removeAsset: (id) =>
      set((state) => {
        const newAssets = { ...state.assets };
        delete newAssets[id];
        return { assets: newAssets };
      }),
    getAsset: (id) => get().assets[id],
  }));
