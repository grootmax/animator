import { describe, it, expect, beforeEach } from 'vitest';
import { AssetRegistry } from './assetRegistry';
import { createSceneGraphStore } from './store';

describe('AssetRegistry & Image Node integration', () => {
  beforeEach(() => {
    // Clear registry before each test
    const all = AssetRegistry.getAllAssets();
    for (const key of Object.keys(all)) {
      AssetRegistry.removeAsset(key);
    }
  });

  it('registers and retrieves assets', () => {
    AssetRegistry.registerAsset('asset1', 'data:image/png;base64,ABC');
    expect(AssetRegistry.getAsset('asset1')).toBe('data:image/png;base64,ABC');
    expect(AssetRegistry.getAllAssets()).toEqual({
      asset1: 'data:image/png;base64,ABC',
    });
  });

  it('bulk loads assets from project file', () => {
    AssetRegistry.loadAssets({
      a1: 'data:image/png;base64,111',
      a2: 'data:image/png;base64,222',
    });
    expect(AssetRegistry.getAsset('a1')).toBe('data:image/png;base64,111');
    expect(AssetRegistry.getAsset('a2')).toBe('data:image/png;base64,222');
  });

  it('garbage collects asset when last referencing image node is deleted', () => {
    AssetRegistry.registerAsset('asset_shared', 'data:image/png;base64,SHARED');
    const store = createSceneGraphStore();

    store.getState().addNode({
      id: 'img1',
      type: 'image',
      assetId: 'asset_shared',
      x: 0,
      y: 0,
    });

    store.getState().addNode({
      id: 'img2',
      type: 'image',
      assetId: 'asset_shared',
      x: 10,
      y: 10,
    });

    expect(AssetRegistry.getAsset('asset_shared')).toBe('data:image/png;base64,SHARED');

    // Delete img1 - asset_shared should still exist because img2 references it
    store.getState().deleteNode('img1');
    expect(AssetRegistry.getAsset('asset_shared')).toBe('data:image/png;base64,SHARED');

    // Delete img2 - asset_shared should now be garbage collected
    store.getState().deleteNode('img2');
    expect(AssetRegistry.getAsset('asset_shared')).toBeUndefined();
  });
});
