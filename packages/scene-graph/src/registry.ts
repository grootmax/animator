export interface Asset {
  id: string;
  type: 'image' | 'video';
  url: string;
  name: string;
  hash: string;
}

export class AssetRegistry {
  private assets: Map<string, Asset> = new Map();
  private hashes: Map<string, string> = new Map();

  async register(file: File): Promise<string> {
    const hash = await this.computeHash(file);
    if (this.hashes.has(hash)) {
      return this.hashes.get(hash)!;
    }

    const id = crypto.randomUUID();
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const url = (file as any).path ? `file://${(file as any).path}` : URL.createObjectURL(file);
    
    this.assets.set(id, {
      id,
      type,
      url,
      name: file.name,
      hash
    });
    this.hashes.set(hash, id);
    
    return id;
  }

  getAsset(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  getAllAssets(): Record<string, Asset> {
    const result: Record<string, Asset> = {};
    for (const [id, asset] of this.assets.entries()) {
      result[id] = asset;
    }
    return result;
  }

  removeAsset(id: string): void {
    const asset = this.assets.get(id);
    if (asset) {
      this.hashes.delete(asset.hash);
      URL.revokeObjectURL(asset.url);
      this.assets.delete(id);
    }
  }

  private async computeHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

export const assetRegistry = new AssetRegistry();
