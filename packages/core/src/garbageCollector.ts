import type { AssetStore } from "./assetStore.js";

export interface TextureUnbinderBridge {
  unbindTexture(assetId: string): boolean;
  isTextureBound(assetId: string): boolean;
}

export interface SweepResult {
  unreferencedFound: number;
  texturesDisposed: number;
  blobsRevoked: number;
  durationMs: number;
}

export class AsyncGarbageCollector {
  private assetStore: AssetStore;
  private rendererBridge: TextureUnbinderBridge | undefined = undefined;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private isSweeping = false;

  public totalRevokedAssetsCount = 0;
  public totalDisposedTexturesCount = 0;
  public lastSweepStats: SweepResult | null = null;

  constructor(
    assetStore: AssetStore,
    rendererBridge?: TextureUnbinderBridge | undefined,
  ) {
    this.assetStore = assetStore;
    this.rendererBridge = rendererBridge;
  }

  public setRendererBridge(bridge: TextureUnbinderBridge | undefined): void {
    this.rendererBridge = bridge;
  }

  /**
   * Starts background periodic garbage collection worker.
   */
  public start(intervalMs = 1000): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      // Run sweep asynchronously in background
      void this.runGarbageCollection();
    }, intervalMs);
  }

  /**
   * Stops background garbage collection worker.
   */
  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Asynchronously performs a garbage collection sweep.
   * Ensures WebGL GPU textures are unbound before Blob Object URLs are revoked.
   */
  public async runGarbageCollection(): Promise<SweepResult> {
    if (this.isSweeping) {
      return {
        unreferencedFound: 0,
        texturesDisposed: 0,
        blobsRevoked: 0,
        durationMs: 0,
      };
    }

    this.isSweeping = true;
    const startTime = Date.now();

    let texturesDisposed = 0;
    let blobsRevoked = 0;

    try {
      const unreferencedIds = this.assetStore.getUnreferencedAssetIds();

      for (const assetId of unreferencedIds) {
        // Yield to event loop periodically to prevent main thread blocking
        if (blobsRevoked > 0 && blobsRevoked % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        // 1. Unbind and release WebGL texture in renderer bridge first
        if (this.rendererBridge) {
          if (this.rendererBridge.isTextureBound(assetId)) {
            const unbound = this.rendererBridge.unbindTexture(assetId);
            if (unbound) {
              texturesDisposed += 1;
              this.totalDisposedTexturesCount += 1;
            }
          }

          // Safety guardrail: Ensure texture is completely unbound before revoking Blob URL
          if (this.rendererBridge.isTextureBound(assetId)) {
            continue; // Skip URL revocation if texture binding persists
          }
        }

        // 2. Revoke Blob Object URL and release binary payload
        const revoked = this.assetStore.revoke(assetId);
        if (revoked) {
          blobsRevoked += 1;
          this.totalRevokedAssetsCount += 1;
        }
      }

      const durationMs = Date.now() - startTime;
      const stats: SweepResult = {
        unreferencedFound: unreferencedIds.length,
        texturesDisposed,
        blobsRevoked,
        durationMs,
      };

      this.lastSweepStats = stats;
      return stats;
    } finally {
      this.isSweeping = false;
    }
  }

  public get running(): boolean {
    return this.intervalTimer !== null;
  }
}
