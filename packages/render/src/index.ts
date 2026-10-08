import type { SceneNode } from "@animator/core";

export const RENDER_VERSION = "0.0.0";

export interface PixiLikeTexture {
  destroy?: (options?: { destroyBase?: boolean }) => void;
  destroyed?: boolean;
}

export interface WebGLLikeTexture {
  id?: string;
}

export interface ManagedTexture {
  src: string;
  refCount: number;
  destroyed: boolean;
  webGlTexture?: WebGLTexture | WebGLLikeTexture | null;
  pixiTexture?: PixiLikeTexture | null;
  destroy: () => void;
}

export type TextureManagerOptions = {
  gl?: WebGLRenderingContext | null;
  pixiCache?: Map<string, unknown> | null;
};

export class TextureManager {
  private textures = new Map<string, ManagedTexture>();
  private pixiCache: Map<string, unknown>;
  private gl: WebGLRenderingContext | null;

  constructor(options?: TextureManagerOptions) {
    this.gl = options?.gl ?? null;
    this.pixiCache = options?.pixiCache ?? new Map<string, unknown>();
  }

  setWebGLContext(gl: WebGLRenderingContext | null): void {
    this.gl = gl;
  }

  getPixiCache(): Map<string, unknown> {
    return this.pixiCache;
  }

  acquire(
    src: string,
    factory?: (src: string) => ManagedTexture,
  ): ManagedTexture {
    if (!src) {
      throw new Error("Texture src cannot be empty");
    }

    let texture = this.textures.get(src);
    if (!texture) {
      if (factory) {
        texture = factory(src);
      } else {
        texture = this.createTexture(src);
      }
      this.textures.set(src, texture);
    }

    texture.refCount += 1;
    return texture;
  }

  release(src: string): boolean {
    if (!src) {
      return false;
    }

    const texture = this.textures.get(src);
    if (!texture) {
      return false;
    }

    texture.refCount -= 1;
    if (texture.refCount <= 0) {
      this.destroyTexture(texture);
      this.textures.delete(src);
      this.pixiCache.delete(src);
      return true;
    }

    return false;
  }

  getRefCount(src: string): number {
    return this.textures.get(src)?.refCount ?? 0;
  }

  hasTexture(src: string): boolean {
    return this.textures.has(src);
  }

  getTexture(src: string): ManagedTexture | undefined {
    return this.textures.get(src);
  }

  clear(): void {
    for (const [src, texture] of this.textures.entries()) {
      this.destroyTexture(texture);
      this.pixiCache.delete(src);
    }
    this.textures.clear();
  }

  private createTexture(src: string): ManagedTexture {
    let webGlTex: WebGLTexture | WebGLLikeTexture | null = null;
    if (this.gl && typeof this.gl.createTexture === "function") {
      try {
        webGlTex = this.gl.createTexture();
      } catch {
        webGlTex = { id: `webgl-tex-${src}` };
      }
    } else {
      webGlTex = { id: `webgl-tex-${src}` };
    }

    const pixiTex: PixiLikeTexture = {
      destroyed: false,
      destroy: (options?: { destroyBase?: boolean }) => {
        pixiTex.destroyed = true;
      },
    };

    this.pixiCache.set(src, pixiTex);

    const managed: ManagedTexture = {
      src,
      refCount: 0,
      destroyed: false,
      webGlTexture: webGlTex,
      pixiTexture: pixiTex,
      destroy: () => {
        if (managed.destroyed) return;
        managed.destroyed = true;

        if (
          this.gl &&
          managed.webGlTexture &&
          typeof this.gl.deleteTexture === "function"
        ) {
          try {
            this.gl.deleteTexture(managed.webGlTexture as WebGLTexture);
          } catch {
            // Ignore errors in mock or closed contexts
          }
        }

        if (
          managed.pixiTexture &&
          typeof managed.pixiTexture.destroy === "function"
        ) {
          managed.pixiTexture.destroy({ destroyBase: true });
        }
      },
    };

    return managed;
  }

  private destroyTexture(texture: ManagedTexture): void {
    texture.destroy();
  }
}

export interface BridgeNode {
  id: string;
  type: string;
  src?: string | undefined;
  texture?: ManagedTexture | null | undefined;
  [key: string]: unknown;
}

export class PixiBridge {
  private textureManager: TextureManager;
  private activeNodes = new Map<string, BridgeNode>();

  constructor(textureManager: TextureManager) {
    this.textureManager = textureManager;
  }

  getTextureManager(): TextureManager {
    return this.textureManager;
  }

  getNode(id: string): BridgeNode | undefined {
    return this.activeNodes.get(id);
  }

  getActiveNodes(): Map<string, BridgeNode> {
    return new Map(this.activeNodes);
  }

  syncNodes(nodes: SceneNode[]): BridgeNode[] {
    const flattenNodes = (list: SceneNode[]): SceneNode[] => {
      const result: SceneNode[] = [];
      for (const node of list) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          result.push(...flattenNodes(node.children));
        }
      }
      return result;
    };

    const flatList = flattenNodes(nodes);
    const newIds = new Set(flatList.map((n) => n.id));

    // 1. Release removed nodes
    for (const [id, existingNode] of this.activeNodes.entries()) {
      if (!newIds.has(id)) {
        if (existingNode.type === "image" && existingNode.src) {
          this.textureManager.release(existingNode.src);
        }
        this.activeNodes.delete(id);
      }
    }

    // 2. Process current nodes
    const result: BridgeNode[] = [];
    for (const node of flatList) {
      const existing = this.activeNodes.get(node.id);

      if (node.type === "image" && node.src) {
        if (!existing) {
          // Newly added image node
          const texture = this.textureManager.acquire(node.src);
          const bridgeNode: BridgeNode = {
            ...node,
            texture,
          };
          this.activeNodes.set(node.id, bridgeNode);
          result.push(bridgeNode);
        } else if (existing.src !== node.src) {
          // Updated image source
          if (existing.src) {
            this.textureManager.release(existing.src);
          }
          const texture = this.textureManager.acquire(node.src);
          const updatedNode: BridgeNode = {
            ...node,
            texture,
          };
          this.activeNodes.set(node.id, updatedNode);
          result.push(updatedNode);
        } else {
          // Unchanged source
          const updatedNode: BridgeNode = {
            ...existing,
            ...node,
            texture: existing.texture ?? null,
          };
          this.activeNodes.set(node.id, updatedNode);
          result.push(updatedNode);
        }
      } else {
        // Non-image node or image node without src
        if (existing && existing.type === "image" && existing.src) {
          this.textureManager.release(existing.src);
        }
        const bridgeNode: BridgeNode = {
          ...node,
          texture: null,
        };
        this.activeNodes.set(node.id, bridgeNode);
        result.push(bridgeNode);
      }
    }

    return result;
  }
}
