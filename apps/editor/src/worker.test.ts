import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWorkerMessage } from './worker';

// Mock PixiBridge to avoid canvas rendering dependencies in tests
vi.mock('@monorepo/renderer', () => {
  function MockPixiBridge() {
    return {
      app: {
        renderer: {
          resize: vi.fn(),
          events: {
            onPointerDown: vi.fn(),
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
          },
        },
        stage: {
          emit: vi.fn(),
        },
      },
    };
  }
  return {
    PixiBridge: MockPixiBridge,
  };
});

describe('Worker message runtime Zod guards', () => {
  beforeEach(() => {
    // Initialize store in worker
    handleWorkerMessage({ data: { type: 'INIT', canvas: {} } });
  });

  it('handles valid ADD_NODE messages', () => {
    handleWorkerMessage({
      data: {
        type: 'ADD_NODE',
        node: {
          id: 'worker_node_1',
          type: 'rect',
          x: 10,
          y: 20,
          width: 100,
          height: 100,
        },
      },
    });
  });

  it('handles valid UPDATE_NODE messages', () => {
    handleWorkerMessage({
      data: {
        type: 'ADD_NODE',
        node: { id: 'worker_node_2', type: 'circle', x: 0, y: 0 },
      },
    });

    handleWorkerMessage({
      data: {
        type: 'UPDATE_NODE',
        id: 'worker_node_2',
        updates: { x: 150, y: 250 },
      },
    });
  });

  it('handles valid BATCH_UPDATE messages', () => {
    handleWorkerMessage({
      data: {
        type: 'BATCH_UPDATE',
        updates: [
          { type: 'ADD', node: { id: 'batch_1', type: 'rect', x: 0, y: 0 } },
          { type: 'UPDATE', id: 'batch_1', updates: { x: 50 } },
        ],
      },
    });
  });

  it('rejects invalid ADD_NODE messages with malformed type', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleWorkerMessage({
      data: {
        type: 'ADD_NODE',
        node: {
          id: 'invalid_node',
          type: 'invalid_type_name',
        },
      },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Worker message validation failed for ADD_NODE:'),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it('rejects invalid BATCH_UPDATE messages with malformed items', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleWorkerMessage({
      data: {
        type: 'BATCH_UPDATE',
        updates: [
          { type: 'UNKNOWN_ACTION', id: 'batch_1' },
        ],
      },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Worker message validation failed for BATCH_UPDATE:'),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });
});
