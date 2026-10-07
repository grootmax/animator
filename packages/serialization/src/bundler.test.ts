import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectBundler } from './bundler';
import { assetProvider } from '@monorepo/scene-graph';

describe('ProjectBundler', () => {
  beforeEach(() => {
    assetProvider.clear();
  });

  it('should export and import bundle with assets correctly', async () => {
    assetProvider.addAsset({
      id: 'asset-1',
      type: 'image',
      name: 'test.png',
      mimeType: 'image/png',
      data: new Uint8Array([1, 2, 3, 4, 5])
    });

    const state: any = {
      nodes: {
        root: { id: 'root', type: 'container', parentId: null },
        media1: { id: 'media1', type: 'media', assetId: 'asset-1', parentId: 'root' }
      },
      rootId: 'root'
    };

    const bundle = await ProjectBundler.exportBundle(state);
    expect(bundle).toBeInstanceOf(Uint8Array);
    expect(bundle.length).toBeGreaterThan(0);

    const imported = await ProjectBundler.importBundle(bundle);
    expect(imported.rootId).toBe('root');
    expect(imported.nodes.media1.assetId).toBe('asset-1');

    expect(assetProvider.hasAsset('asset-1')).toBe(true);
    const asset = assetProvider.getAsset('asset-1');
    expect(asset).toBeDefined();
    expect(asset?.name).toBe('test.png');
  });

  it('should throw error when importing invalid bundle format', async () => {
    const invalidBundle = new TextEncoder().encode('INVALID_MAGIC_HEADER');
    await expect(ProjectBundler.importBundle(invalidBundle)).rejects.toThrow('Invalid bundle format');
  });
});
