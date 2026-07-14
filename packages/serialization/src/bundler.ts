import { SceneGraphState, assetProvider, Asset } from '@monorepo/scene-graph';

export class ProjectBundler {
  static async exportBundle(state: SceneGraphState): Promise<Uint8Array> {
    const assets = assetProvider.getAllAssets();
    
    const manifest = {
      scene: state.nodes,
      rootId: state.rootId,
      assets: assets.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        mimeType: a.mimeType
      }))
    };

    const manifestJson = JSON.stringify(manifest);
    const encoder = new TextEncoder();
    const manifestBytes = encoder.encode(manifestJson);

    // Calculate total size
    let totalSize = 8; // 'UMB1' (4) + manifest length (4)
    totalSize += manifestBytes.length;
    
    // We also need to store the lengths of each asset
    // Format: [Asset 1 Length (4 bytes)][Asset 1 Data]...
    const assetBuffers: Uint8Array[] = [];
    for (const asset of assets) {
      let dataBytes: Uint8Array;
      if (typeof asset.data === 'string') {
        // If it's a base64 string or object URL, we should ideally handle it.
        // For simplicity, if it's base64 data URI, extract it. 
        if (asset.data.startsWith('data:')) {
          const base64 = asset.data.split(',')[1];
          const binStr = atob(base64);
          dataBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            dataBytes[i] = binStr.charCodeAt(i);
          }
        } else {
          // just encode string
          dataBytes = encoder.encode(asset.data);
        }
      } else {
        dataBytes = asset.data;
      }
      assetBuffers.push(dataBytes);
      totalSize += 4 + dataBytes.length;
    }

    const bundle = new Uint8Array(totalSize);
    const view = new DataView(bundle.buffer);

    // Write magic
    bundle.set(encoder.encode('UMB1'), 0);
    
    // Write manifest length
    view.setUint32(4, manifestBytes.length, true); // little endian
    
    // Write manifest
    bundle.set(manifestBytes, 8);
    
    let offset = 8 + manifestBytes.length;
    
    // Write assets
    for (const dataBytes of assetBuffers) {
      view.setUint32(offset, dataBytes.length, true);
      offset += 4;
      bundle.set(dataBytes, offset);
      offset += dataBytes.length;
    }

    return bundle;
  }

  static async importBundle(bundle: Uint8Array): Promise<{ nodes: any, rootId: string }> {
    const view = new DataView(bundle.buffer, bundle.byteOffset, bundle.byteLength);
    const decoder = new TextDecoder();
    
    const magic = decoder.decode(bundle.subarray(0, 4));
    if (magic !== 'UMB1') {
      throw new Error('Invalid bundle format');
    }

    const manifestLength = view.getUint32(4, true);
    const manifestBytes = bundle.subarray(8, 8 + manifestLength);
    const manifest = JSON.parse(decoder.decode(manifestBytes));

    let offset = 8 + manifestLength;

    // Clear existing assets and load new ones
    assetProvider.clear();
    
    for (const assetMeta of manifest.assets) {
      const dataLength = view.getUint32(offset, true);
      offset += 4;
      
      const dataBytes = bundle.subarray(offset, offset + dataLength);
      
      // Store raw bytes, we'll convert to object URL in the application layer if needed
      // but let's just store as Blob/Object URL for immediate use
      let objectUrl: string | Uint8Array = dataBytes;
      if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        const blob = new Blob([dataBytes as any], { type: assetMeta.mimeType });
        objectUrl = URL.createObjectURL(blob);
      }
      
      assetProvider.addAsset({
        id: assetMeta.id,
        type: assetMeta.type,
        name: assetMeta.name,
        mimeType: assetMeta.mimeType,
        data: objectUrl
      });
      
      offset += dataLength;
    }

    return {
      nodes: manifest.scene,
      rootId: manifest.rootId
    };
  }
}
