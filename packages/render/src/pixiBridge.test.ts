import { AssetStore } from "@animator/core";
import { describe, expect, it } from "vitest";
import { PixiBridge } from "./pixiBridge.js";

const BASE64_IMG_1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const BASE64_IMG_2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("PixiBridge", () => {
  it("renders image sprites from Blob Object URLs", () => {
    const store = new AssetStore();
    const bridge = new PixiBridge();

    const record = store.storeSync(BASE64_IMG_1, { ownerId: "sprite-1" });
    const sprite = bridge.renderImageNode(
      "sprite-1",
      record.assetId,
      record.url,
      800,
      600,
    );

    expect(sprite.nodeId).toBe("sprite-1");
    expect(sprite.assetId).toBe(record.assetId);
    expect(sprite.blobUrl).toBe(record.url);

    expect(bridge.isTextureBound(record.assetId)).toBe(true);
    expect(bridge.getTextureMemoryUsage().activeTextureCount).toBe(1);
    expect(bridge.getTextureMemoryUsage().memoryBytes).toBeGreaterThan(0);
  });

  it("updates texture sources and notifies AssetStore when source changes", () => {
    const store = new AssetStore();
    const bridge = new PixiBridge();

    const record1 = store.storeSync(BASE64_IMG_1, { ownerId: "sprite-1" });
    const record2 = store.storeSync(BASE64_IMG_2, { ownerId: "sprite-1" });

    bridge.renderImageNode("sprite-1", record1.assetId, record1.url);
    expect(bridge.isTextureBound(record1.assetId)).toBe(true);

    bridge.updateTextureSource("sprite-1", record2.assetId, record2.url, store);

    // Old texture for record1 should be unbound
    expect(bridge.isTextureBound(record1.assetId)).toBe(false);
    expect(bridge.isTextureBound(record2.assetId)).toBe(true);
    expect(store.getRefCount(record1.assetId)).toBe(0);
    expect(store.getRefCount(record2.assetId)).toBe(1);
  });

  it("unbinds WebGL textures and frees memory when sprite is removed", () => {
    const store = new AssetStore();
    const bridge = new PixiBridge();

    const record = store.storeSync(BASE64_IMG_1, { ownerId: "sprite-2" });
    bridge.renderImageNode("sprite-2", record.assetId, record.url);

    expect(bridge.getTextureMemoryUsage().memoryBytes).toBeGreaterThan(0);

    const removed = bridge.removeSprite("sprite-2", store);

    expect(removed).toBe(true);
    expect(bridge.isTextureBound(record.assetId)).toBe(false);
    expect(bridge.getTextureMemoryUsage().memoryBytes).toBe(0);
    expect(store.getRefCount(record.assetId)).toBe(0);
  });
});
