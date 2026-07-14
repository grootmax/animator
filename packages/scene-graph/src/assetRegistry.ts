export class AssetRegistry {
  private static assets: Map<string, string> = new Map(); // assetId -> data (e.g. data URL)

  static registerAsset(id: string, data: string): void {
    if (!this.assets.has(id)) {
      this.assets.set(id, data);
    }
  }

  static getAsset(id: string): string | undefined {
    return this.assets.get(id);
  }

  static removeAsset(id: string): void {
    this.assets.delete(id);
  }

  static getAllAssets(): Record<string, string> {
    return Object.fromEntries(this.assets.entries());
  }

  static loadAssets(assets: Record<string, string>): void {
    for (const [id, data] of Object.entries(assets)) {
      this.assets.set(id, data);
    }
  }
}
