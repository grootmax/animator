import { createHash } from "node:crypto";

export interface AssetRecord {
  assetId: string;
  blob: Blob;
  url: string;
  mimeType: string;
  size: number;
  refCount: number;
  owners: Set<string>;
  createdAt: number;
}

export interface StoreOptions {
  mimeType?: string;
  ownerId?: string;
}

export class AssetStore {
  private assets: Map<string, AssetRecord> = new Map();

  /**
   * Calculates a content-addressed SHA-256 hash for binary data or base64 string.
   */
  private computeHash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  /**
   * Helper to convert base64 or Data URL or Uint8Array or Blob to binary bytes and mimeType.
   */
  private parsePayload(
    payload: string | Uint8Array | Blob,
    defaultMime = "image/png",
  ): { bytes: Uint8Array; mimeType: string } {
    if (typeof payload === "string") {
      let mimeType = defaultMime;
      let base64Data = payload;

      if (payload.startsWith("data:")) {
        const matches = payload.match(/^data:([^;]+);base64,(.*)$/s);
        if (matches?.[1] && matches[2]) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      // Remove whitespace/newlines if any
      const cleanedBase64 = base64Data.replace(/\s/g, "");
      const buffer = Buffer.from(cleanedBase64, "base64");
      return { bytes: new Uint8Array(buffer), mimeType };
    }

    if (payload instanceof Uint8Array) {
      return { bytes: payload, mimeType: defaultMime };
    }

    if (typeof Blob !== "undefined" && payload instanceof Blob) {
      // Blob in sync path - we assume payload type or default
      throw new Error("Use store() for Blob instances");
    }

    throw new Error("Unsupported payload format");
  }

  /**
   * Synchronously store a base64 string or Uint8Array binary asset.
   * Content-addressing ensures identical binary payloads yield identical assetIds.
   */
  public storeSync(
    payload: string | Uint8Array,
    options: StoreOptions = {},
  ): AssetRecord {
    const { bytes, mimeType } = this.parsePayload(
      payload,
      options.mimeType || "image/png",
    );
    const hash = this.computeHash(bytes);
    const assetId = `asset-${hash}`;

    let record = this.assets.get(assetId);
    if (record) {
      if (options.ownerId) {
        record.owners.add(options.ownerId);
      }
      record.refCount =
        record.owners.size > 0 ? record.owners.size : record.refCount + 1;
      return record;
    }

    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const owners = new Set<string>();
    if (options.ownerId) {
      owners.add(options.ownerId);
    }

    record = {
      assetId,
      blob,
      url,
      mimeType,
      size: bytes.byteLength,
      refCount: owners.size > 0 ? owners.size : 1,
      owners,
      createdAt: Date.now(),
    };

    this.assets.set(assetId, record);
    return record;
  }

  /**
   * Asynchronously store a payload (supports base64, Uint8Array, or Blob).
   */
  public async store(
    payload: string | Uint8Array | Blob,
    options: StoreOptions = {},
  ): Promise<AssetRecord> {
    if (typeof Blob !== "undefined" && payload instanceof Blob) {
      const arrayBuffer = await payload.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const mimeType = payload.type || options.mimeType || "image/png";
      const hash = this.computeHash(bytes);
      const assetId = `asset-${hash}`;

      let record = this.assets.get(assetId);
      if (record) {
        if (options.ownerId) {
          record.owners.add(options.ownerId);
        }
        record.refCount =
          record.owners.size > 0 ? record.owners.size : record.refCount + 1;
        return record;
      }

      const url = URL.createObjectURL(payload);
      const owners = new Set<string>();
      if (options.ownerId) {
        owners.add(options.ownerId);
      }

      record = {
        assetId,
        blob: payload,
        url,
        mimeType,
        size: payload.size,
        refCount: owners.size > 0 ? owners.size : 1,
        owners,
        createdAt: Date.now(),
      };

      this.assets.set(assetId, record);
      return record;
    }

    return this.storeSync(payload as string | Uint8Array, options);
  }

  public get(assetId: string): AssetRecord | undefined {
    return this.assets.get(assetId);
  }

  public getUrl(assetId: string): string | undefined {
    return this.assets.get(assetId)?.url;
  }

  public has(assetId: string): boolean {
    return this.assets.has(assetId);
  }

  public addRef(assetId: string, ownerId?: string): number {
    const record = this.assets.get(assetId);
    if (!record) return 0;

    if (ownerId) {
      record.owners.add(ownerId);
      record.refCount = record.owners.size;
    } else {
      record.refCount += 1;
    }
    return record.refCount;
  }

  public removeRef(assetId: string, ownerId?: string): number {
    const record = this.assets.get(assetId);
    if (!record) return 0;

    if (ownerId) {
      record.owners.delete(ownerId);
      record.refCount = record.owners.size;
    } else {
      record.refCount = Math.max(0, record.refCount - 1);
    }
    return record.refCount;
  }

  public getRefCount(assetId: string): number {
    return this.assets.get(assetId)?.refCount ?? 0;
  }

  public getUnreferencedAssetIds(): string[] {
    const unreferenced: string[] = [];
    for (const [assetId, record] of this.assets.entries()) {
      if (record.refCount <= 0) {
        unreferenced.push(assetId);
      }
    }
    return unreferenced;
  }

  public getAllAssetIds(): string[] {
    return Array.from(this.assets.keys());
  }

  /**
   * Revokes the Blob Object URL and removes the binary from memory.
   */
  public revoke(assetId: string): boolean {
    const record = this.assets.get(assetId);
    if (!record) return false;

    if (record.url) {
      try {
        URL.revokeObjectURL(record.url);
      } catch {
        // Ignore revocation errors in mocked environments
      }
    }

    this.assets.delete(assetId);
    return true;
  }

  public clear(): void {
    for (const assetId of Array.from(this.assets.keys())) {
      this.revoke(assetId);
    }
  }

  public get count(): number {
    return this.assets.size;
  }
}
