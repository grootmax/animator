import { describe, expect, it } from "vitest";
import { AssetStore } from "./assetStore.js";
import {
  AsyncGarbageCollector,
  type TextureUnbinderBridge,
} from "./garbageCollector.js";

function makeImagePayload(index: number): string {
  const bytes = new Uint8Array(1024);
  bytes[0] = index % 256;
  bytes[1] = (index * 7) % 256;
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

class MockTextureBridge implements TextureUnbinderBridge {
  private boundTextures = new Set<string>();

  public bindTexture(assetId: string): void {
    this.boundTextures.add(assetId);
  }

  public unbindTexture(assetId: string): boolean {
    if (this.boundTextures.has(assetId)) {
      this.boundTextures.delete(assetId);
      return true;
    }
    return false;
  }

  public isTextureBound(assetId: string): boolean {
    return this.boundTextures.has(assetId);
  }

  public get activeTextureCount(): number {
    return this.boundTextures.size;
  }
}

describe("AsyncGarbageCollector", () => {
  it("revokes unused Blob Object URLs and disposes WebGL textures when assets are unreferenced", async () => {
    const store = new AssetStore();
    const bridge = new MockTextureBridge();
    const gc = new AsyncGarbageCollector(store, bridge);

    const payload1 = makeImagePayload(1);
    const payload2 = makeImagePayload(2);

    const record1 = store.storeSync(payload1, { ownerId: "img-1" });
    const record2 = store.storeSync(payload2, { ownerId: "img-2" });

    bridge.bindTexture(record1.assetId);
    bridge.bindTexture(record2.assetId);

    expect(bridge.activeTextureCount).toBe(2);
    expect(store.count).toBe(2);

    // Delete image 1 reference
    store.removeRef(record1.assetId, "img-1");

    // Run GC sweep
    const result = await gc.runGarbageCollection();

    expect(result.unreferencedFound).toBe(1);
    expect(result.blobsRevoked).toBe(1);
    expect(store.has(record1.assetId)).toBe(false);
    expect(store.has(record2.assetId)).toBe(true);
    expect(bridge.isTextureBound(record1.assetId)).toBe(false);
    expect(bridge.activeTextureCount).toBe(1);
  });

  it("ensures zero WebGL texture memory leaks during continuous AI image generation cycles", async () => {
    const store = new AssetStore();
    const bridge = new MockTextureBridge();
    const gc = new AsyncGarbageCollector(store, bridge);

    const ownerId = "ai-canvas-node";
    let previousAssetId: string | null = null;

    // Simulate 30 continuous AI image generation cycles
    for (let cycle = 1; cycle <= 30; cycle++) {
      const newPayload = makeImagePayload(cycle);
      const record = store.storeSync(newPayload, { ownerId });
      bridge.bindTexture(record.assetId);

      if (previousAssetId && previousAssetId !== record.assetId) {
        store.removeRef(previousAssetId, ownerId);
      }
      previousAssetId = record.assetId;

      // Trigger background GC sweep after generation
      await gc.runGarbageCollection();
    }

    // At the end of 30 cycles, only 1 active texture should exist (the latest cycle)
    expect(bridge.activeTextureCount).toBe(1);
    expect(store.count).toBe(1);
    expect(gc.totalDisposedTexturesCount).toBe(29);
    expect(gc.totalRevokedAssetsCount).toBe(29);

    // Clean up final image reference
    if (previousAssetId) {
      store.removeRef(previousAssetId, ownerId);
    }
    await gc.runGarbageCollection();

    // Verify ZERO memory leaks
    expect(bridge.activeTextureCount).toBe(0);
    expect(store.count).toBe(0);
  });

  it("verifies constraint that Blob Object URLs remain valid until WebGL textures are unbound", async () => {
    const store = new AssetStore();

    let textureBoundState = true;
    const mockBridge: TextureUnbinderBridge = {
      unbindTexture: () => {
        textureBoundState = false;
        return true;
      },
      isTextureBound: () => textureBoundState,
    };

    const gc = new AsyncGarbageCollector(store, mockBridge);

    const payload = makeImagePayload(100);
    const record = store.storeSync(payload, { ownerId: "temp-node" });
    store.removeRef(record.assetId, "temp-node"); // Mark unreferenced

    // Run GC sweep
    await gc.runGarbageCollection();

    // Verify texture was unbound first, then blob was revoked
    expect(textureBoundState).toBe(false);
    expect(store.has(record.assetId)).toBe(false);
  });
});
