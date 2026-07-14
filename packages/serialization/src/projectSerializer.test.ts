import { describe, it, expect } from 'vitest';
import { serializeProject } from './projectSerializer';

describe('serializeProject', () => {
  it('should strip internal matrices and dirty flags from scene nodes', () => {
    const payload = {
      scene: {
        node1: {
          id: 'node1',
          name: 'Node 1',
          type: 'rect',
          localMatrix: [1, 0, 0, 1, 0, 0],
          worldMatrix: [1, 0, 0, 1, 0, 0],
          isDirty: true,
          x: 10,
          y: 20
        }
      },
      animations: [],
      metadata: {
        version: '1.0.0',
        duration: 1000
      }
    };

    const result = serializeProject(payload);
    const parsed = JSON.parse(result);

    expect(parsed.scene.node1.id).toBe('node1');
    expect(parsed.scene.node1.x).toBe(10);
    expect(parsed.scene.node1.localMatrix).toBeUndefined();
    expect(parsed.scene.node1.worldMatrix).toBeUndefined();
    expect(parsed.scene.node1.isDirty).toBeUndefined();
    expect(parsed.metadata.version).toBe('1.0.0');
  });
});
