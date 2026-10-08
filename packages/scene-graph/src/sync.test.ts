import { describe, it, expect, vi } from 'vitest';
import { createSceneGraphStore } from './store';

describe('syncMiddleware runtime Zod guards', () => {
  it('applies valid addNode remote sync messages', () => {
    let broadcastMsg: any = null;
    const store = createSceneGraphStore((msg) => {
      broadcastMsg = msg;
    });

    const remoteMessage = {
      type: 'addNode',
      payload: {
        id: 'node1',
        type: 'rect',
        x: 100,
        y: 200,
        width: 50,
        height: 50,
      },
    };

    (store as any).applyRemote(remoteMessage);

    const nodes = store.getState().nodes;
    expect(nodes['node1']).toBeDefined();
    expect(nodes['node1'].x).toBe(100);
    expect(nodes['node1'].type).toBe('rect');
  });

  it('applies valid updateNode remote sync messages', () => {
    const store = createSceneGraphStore(() => {});
    store.getState().addNode({ id: 'node1', type: 'rect', x: 0, y: 0 });

    const remoteMessage = {
      type: 'updateNode',
      payload: {
        id: 'node1',
        updates: { x: 300, y: 400 },
      },
    };

    (store as any).applyRemote(remoteMessage);

    expect(store.getState().nodes['node1'].x).toBe(300);
    expect(store.getState().nodes['node1'].y).toBe(400);
  });

  it('rejects malformed addNode remote messages with invalid node type', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createSceneGraphStore(() => {});

    const invalidMessage = {
      type: 'addNode',
      payload: {
        id: 'bad_node',
        type: 'non_existent_type',
      },
    };

    (store as any).applyRemote(invalidMessage);

    expect(store.getState().nodes['bad_node']).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('rejects malformed sync messages with missing required payload fields', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createSceneGraphStore(() => {});

    const invalidMessage = {
      type: 'addNode',
      payload: {
        // missing 'id' and 'type'
        x: 10,
      },
    };

    (store as any).applyRemote(invalidMessage);

    expect(Object.keys(store.getState().nodes).length).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
