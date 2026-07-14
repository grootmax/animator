import * as PIXI from 'pixi.js';
import { globalAssetRegistry } from '@monorepo/scene-graph';
import { tokenizePath } from '@monorepo/serialization';

export interface CachedTexture {
  texture: PIXI.Texture;
  offsetX: number;
  offsetY: number;
}

export class AsyncTextureCache {
  private cache: Map<string, CachedTexture> = new Map();
  private pending: Map<string, Promise<CachedTexture>> = new Map();
  private app: PIXI.Application;

  constructor(app: PIXI.Application) {
    this.app = app;
    // Listen to registry removals to free memory
    globalAssetRegistry.subscribe((event) => {
      if (event.type === 'remove' && event.id) {
        this.clearAsset(event.id);
      }
    });
  }

  public clearAsset(assetId: string) {
    // Remove all textures related to this assetId
    for (const key of this.cache.keys()) {
      if (key === assetId || key.startsWith(`${assetId}_`)) {
        const cached = this.cache.get(key);
        cached?.texture?.destroy(true);
        this.cache.delete(key);
      }
    }
  }

  public async getTextureForAsset(assetId: string, node: any): Promise<CachedTexture | null> {
    const asset = globalAssetRegistry.getAsset(assetId);
    if (!asset) return null;

    if (asset.type === 'image') {
      const cacheKey = assetId;
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
      if (this.pending.has(cacheKey)) return this.pending.get(cacheKey)!;

      const promise = PIXI.Assets.load(asset.data).then((tex) => {
        const result = { texture: tex, offsetX: 0, offsetY: 0 };
        this.cache.set(cacheKey, result);
        this.pending.delete(cacheKey);
        return result;
      }).catch(() => {
        this.pending.delete(cacheKey);
        return { texture: PIXI.Texture.EMPTY, offsetX: 0, offsetY: 0 };
      });
      this.pending.set(cacheKey, promise);
      return promise;
    }

    if (asset.type === 'path') {
      const cacheKey = `${assetId}_${node.fill}_${node.stroke}_${node.strokeWidth}`;
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
      if (this.pending.has(cacheKey)) return this.pending.get(cacheKey)!;

      const promise = new Promise<CachedTexture>((resolve) => {
        // Yield to avoid blocking main thread entirely if parsing is heavy
        setTimeout(() => {
          const graphics = new PIXI.Graphics();
          
          if (node.fill) {
            graphics.beginFill(parseInt(node.fill.replace('#', '0x')));
          }
          if (node.stroke) {
            graphics.lineStyle(node.strokeWidth ?? 2, parseInt(node.stroke.replace('#', '0x')));
          }

          const tokens = tokenizePath(asset.data);
          let x = 0, y = 0;
          for (const t of tokens) {
            const p = t.args;
            switch (t.type) {
              case 'M': x = p[0]; y = p[1]; graphics.moveTo(x, y); break;
              case 'm': x += p[0]; y += p[1]; graphics.moveTo(x, y); break;
              case 'L': x = p[0]; y = p[1]; graphics.lineTo(x, y); break;
              case 'l': x += p[0]; y += p[1]; graphics.lineTo(x, y); break;
              case 'H': x = p[0]; graphics.lineTo(x, y); break;
              case 'h': x += p[0]; graphics.lineTo(x, y); break;
              case 'V': y = p[0]; graphics.lineTo(x, y); break;
              case 'v': y += p[0]; graphics.lineTo(x, y); break;
              case 'C':
                graphics.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
                x = p[4]; y = p[5];
                break;
              case 'c':
                graphics.bezierCurveTo(x+p[0], y+p[1], x+p[2], y+p[3], x+p[4], y+p[5]);
                x += p[4]; y += p[5];
                break;
              case 'Z': case 'z':
                graphics.closePath();
                break;
            }
          }

          if (node.fill) graphics.endFill();

          const bounds = graphics.getLocalBounds();
          const tex = this.app.renderer.generateTexture(graphics, {
              region: bounds
          });
          graphics.destroy();

          const result = { texture: tex, offsetX: bounds.x, offsetY: bounds.y };
          this.cache.set(cacheKey, result);
          this.pending.delete(cacheKey);
          resolve(result);
        }, 0);
      });

      this.pending.set(cacheKey, promise);
      return promise;
    }

    return null;
  }
}
