export type AssetType = 'path' | 'image';

export interface Asset {
  id: string;
  type: AssetType;
  data: string; // The raw string data, e.g., SVG path string or image URL/base64
}

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
