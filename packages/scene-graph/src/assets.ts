export interface AssetMeta {
  id: string;
  name: string;
  type: "image" | "svg" | "audio" | "video";
  url: string;
}

export class AssetRegistry {
  private assets: Map<string, AssetMeta> = new Map();

  register(asset: AssetMeta): void {
    this.assets.set(asset.id, asset);
  }

  get(id: string): AssetMeta | undefined {
    return this.assets.get(id);
  }

  list(): AssetMeta[] {
    return Array.from(this.assets.values());
  }
}
