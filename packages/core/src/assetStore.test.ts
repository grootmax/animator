import { describe, expect, it } from "vitest";
import { AssetStore } from "./assetStore.js";

// Sample small base64 1x1 PNG image data URL
const SAMPLE_BASE64_1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const SAMPLE_BASE64_2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("AssetStore", () => {
  it("converts base64 image string into Blob Object URL", () => {
    const store = new AssetStore();
    const record = store.storeSync(SAMPLE_BASE64_1, { ownerId: "node-1" });

    expect(record.assetId).toMatch(/^asset-[a-f0-9]{64}$/);
    expect(record.url).toMatch(/^blob:/);
    expect(record.mimeType).toBe("image/png");
    expect(record.refCount).toBe(1);
    expect(store.has(record.assetId)).toBe(true);
  });

  it("deduplicates identical base64 binary payloads (content addressing)", () => {
    const store = new AssetStore();
    const record1 = store.storeSync(SAMPLE_BASE64_1, { ownerId: "node-1" });
    const record2 = store.storeSync(SAMPLE_BASE64_1, { ownerId: "node-2" });

    expect(record1.assetId).toBe(record2.assetId);
    expect(record1.url).toBe(record2.url);
    expect(store.count).toBe(1);
    expect(store.getRefCount(record1.assetId)).toBe(2);
  });

  it("differentiates different image payloads", () => {
    const store = new AssetStore();
    const record1 = store.storeSync(SAMPLE_BASE64_1, { ownerId: "node-1" });
    const record2 = store.storeSync(SAMPLE_BASE64_2, { ownerId: "node-2" });

    expect(record1.assetId).not.toBe(record2.assetId);
    expect(store.count).toBe(2);
  });

  it("manages reference counts and owner tracking", () => {
    const store = new AssetStore();
    const record = store.storeSync(SAMPLE_BASE64_1, { ownerId: "node-1" });
    const assetId = record.assetId;

    store.addRef(assetId, "node-2");
    expect(store.getRefCount(assetId)).toBe(2);

    store.removeRef(assetId, "node-1");
    expect(store.getRefCount(assetId)).toBe(1);

    expect(store.getUnreferencedAssetIds()).toEqual([]);

    store.removeRef(assetId, "node-2");
    expect(store.getRefCount(assetId)).toBe(0);
    expect(store.getUnreferencedAssetIds()).toEqual([assetId]);
  });

  it("revokes Blob Object URLs and removes binary storage", () => {
    const store = new AssetStore();
    const record = store.storeSync(SAMPLE_BASE64_1, { ownerId: "node-1" });
    const assetId = record.assetId;

    expect(store.has(assetId)).toBe(true);
    const revoked = store.revoke(assetId);

    expect(revoked).toBe(true);
    expect(store.has(assetId)).toBe(false);
    expect(store.count).toBe(0);
  });

  it("supports async store method with Blob or Uint8Array", async () => {
    const store = new AssetStore();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([bytes], { type: "image/jpeg" });

    const record = await store.store(blob, { ownerId: "node-3" });
    expect(record.assetId).toMatch(/^asset-/);
    expect(record.mimeType).toBe("image/jpeg");
    expect(store.has(record.assetId)).toBe(true);
  });
});
