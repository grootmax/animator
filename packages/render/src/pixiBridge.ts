export interface WebGLTextureObject {
  textureId: string;
  assetId: string;
  blobUrl: string;
  bytes: number;
  isDestroyed: boolean;
  boundAt: number;
  destroy: (destroyBase?: boolean) => void;
}

export interface SpriteObject {
  nodeId: string;
  assetId: string;
  blobUrl: string;
  width: number;
  height: number;
  textureId: string;
}

export interface TextureMemoryUsage {
  activeTextureCount: number;
  memoryBytes: number;
  boundAssetIds: string[];
}

export interface AssetStoreRefInterface {
  addRef(assetId: string, ownerId?: string): number;
  removeRef(assetId: string, ownerId?: string): number;
}

export class PixiBridge {
  private sprites: Map<string, SpriteObject> = new Map();
  private boundTextures: Map<string, WebGLTextureObject> = new Map();

  /**
   * Helper to estimate texture memory footprint in WebGL GPU VRAM (4 bytes per pixel: RGBA8888).
   */
  private estimateTextureBytes(width = 512, height = 512): number {
    return width * height * 4;
  }

  /**
   * Renders an image sprite from a Blob Object URL and binds a WebGL GPU texture.
   */
  public renderImageNode(
    nodeId: string,
    assetId: string,
    blobUrl: string,
    width = 512,
    height = 512,
  ): SpriteObject {
    const existingSprite = this.sprites.get(nodeId);
    if (existingSprite) {
      if (existingSprite.assetId !== assetId) {
        return this.updateTextureSource(
          nodeId,
          assetId,
          blobUrl,
          undefined,
          width,
          height,
        );
      }
      return existingSprite;
    }

    let texture = this.boundTextures.get(assetId);
    if (!texture || texture.isDestroyed) {
      const textureId = `tex-${assetId}-${Date.now()}`;
      const bytes = this.estimateTextureBytes(width, height);

      const texObj: WebGLTextureObject = {
        textureId,
        assetId,
        blobUrl,
        bytes,
        isDestroyed: false,
        boundAt: Date.now(),
        destroy: (_destroyBase = true) => {
          texObj.isDestroyed = true;
          this.boundTextures.delete(assetId);
        },
      };
      texture = texObj;

      this.boundTextures.set(assetId, texture);
    }

    const sprite: SpriteObject = {
      nodeId,
      assetId,
      blobUrl,
      width,
      height,
      textureId: texture.textureId,
    };

    this.sprites.set(nodeId, sprite);
    return sprite;
  }

  /**
   * Updates texture source for a sprite node when image asset changes.
   * Unbinds old texture source and notifies AssetStore.
   */
  public updateTextureSource(
    nodeId: string,
    newAssetId: string,
    newBlobUrl: string,
    assetStore?: AssetStoreRefInterface,
    width = 512,
    height = 512,
  ): SpriteObject {
    const existingSprite = this.sprites.get(nodeId);
    if (existingSprite) {
      const oldAssetId = existingSprite.assetId;
      if (oldAssetId !== newAssetId) {
        if (assetStore) {
          assetStore.removeRef(oldAssetId, nodeId);
          assetStore.addRef(newAssetId, nodeId);
        }

        // Check if any other sprites still reference the old asset
        const isOldAssetStillInUse = Array.from(this.sprites.values()).some(
          (s) => s.nodeId !== nodeId && s.assetId === oldAssetId,
        );

        if (!isOldAssetStillInUse) {
          this.unbindTexture(oldAssetId);
        }
      }
    } else if (assetStore) {
      assetStore.addRef(newAssetId, nodeId);
    }

    let texture = this.boundTextures.get(newAssetId);
    if (!texture || texture.isDestroyed) {
      const textureId = `tex-${newAssetId}-${Date.now()}`;
      const bytes = this.estimateTextureBytes(width, height);

      const newTexObj: WebGLTextureObject = {
        textureId,
        assetId: newAssetId,
        blobUrl: newBlobUrl,
        bytes,
        isDestroyed: false,
        boundAt: Date.now(),
        destroy: () => {
          newTexObj.isDestroyed = true;
          this.boundTextures.delete(newAssetId);
        },
      };
      texture = newTexObj;

      this.boundTextures.set(newAssetId, texture);
    }

    const sprite: SpriteObject = {
      nodeId,
      assetId: newAssetId,
      blobUrl: newBlobUrl,
      width,
      height,
      textureId: texture.textureId,
    };

    this.sprites.set(nodeId, sprite);
    return sprite;
  }

  /**
   * Removes sprite and unbinds associated WebGL texture if no other sprites reference it.
   */
  public removeSprite(
    nodeId: string,
    assetStore?: AssetStoreRefInterface,
  ): boolean {
    const sprite = this.sprites.get(nodeId);
    if (!sprite) return false;

    const assetId = sprite.assetId;
    this.sprites.delete(nodeId);

    if (assetStore) {
      assetStore.removeRef(assetId, nodeId);
    }

    const isAssetStillInUse = Array.from(this.sprites.values()).some(
      (s) => s.assetId === assetId,
    );

    if (!isAssetStillInUse) {
      this.unbindTexture(assetId);
    }

    return true;
  }

  /**
   * Explicitly unbinds and disposes WebGL texture associated with an asset.
   */
  public unbindTexture(assetId: string): boolean {
    const texture = this.boundTextures.get(assetId);
    if (!texture) return false;

    texture.destroy(true);
    this.boundTextures.delete(assetId);
    return true;
  }

  /**
   * Checks if a WebGL GPU texture is currently bound for an asset ID.
   */
  public isTextureBound(assetId: string): boolean {
    const texture = this.boundTextures.get(assetId);
    return Boolean(texture && !texture.isDestroyed);
  }

  /**
   * Gets active sprites count.
   */
  public getSpriteCount(): number {
    return this.sprites.size;
  }

  /**
   * Gets total active WebGL GPU texture memory usage.
   */
  public getTextureMemoryUsage(): TextureMemoryUsage {
    let memoryBytes = 0;
    const boundAssetIds: string[] = [];

    for (const [assetId, texture] of this.boundTextures.entries()) {
      if (!texture.isDestroyed) {
        memoryBytes += texture.bytes;
        boundAssetIds.push(assetId);
      }
    }

    return {
      activeTextureCount: boundAssetIds.length,
      memoryBytes,
      boundAssetIds,
    };
  }

  public clear(): void {
    for (const assetId of Array.from(this.boundTextures.keys())) {
      this.unbindTexture(assetId);
    }
    this.sprites.clear();
  }
}
