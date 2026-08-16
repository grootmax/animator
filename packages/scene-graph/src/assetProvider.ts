export type AssetType = 'image' | 'video';

export interface Asset {
  id: string;
  type: AssetType;
  data: Uint8Array | string; // binary data or object URL
  name: string;
  mimeType: string;
}

export class AssetProvider {
  private assets = new Map<string, Asset>();
  
  addAsset(asset: Asset) {
     this.assets.set(asset.id, asset);
  }
  
  getAsset(id: string): Asset | undefined {
     return this.assets.get(id);
  }
  
  removeAsset(id: string) {
     this.assets.delete(id);
  }
  
  getAllAssets(): Asset[] {
     return Array.from(this.assets.values());
  }
  
  hasAsset(id: string): boolean {
     return this.assets.has(id);
  }
  
  clear() {
     this.assets.clear();
  }
}

export const assetProvider = new AssetProvider();
