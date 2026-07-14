import { describe, it, expect } from 'vitest';
import { validateAndSerializeProject } from './projectSchema';

describe('validateAndSerializeProject', () => {
  it('should successfully validate and serialize a well-formed project', () => {
    const validProject = {
      scene: {
        node1: {
          id: 'node1',
          name: 'My Node',
          type: 'rect',
          parentId: null,
          children: [],
          x: 10,
          y: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          width: 100,
          height: 100,
        }
      },
      animations: [
        {
          nodeId: 'node1',
          property: 'x',
          keyframes: [
            { time: 0, value: 10, easing: 'linear' },
            { time: 1000, value: 100, easing: 'easeInQuad' }
          ]
        }
      ],
      metadata: {
        version: '1.0.0',
        duration: 5000
      }
    };

    const serialized = validateAndSerializeProject(validProject);
    expect(typeof serialized).toBe('string');
    const parsed = JSON.parse(serialized);
    expect(parsed.metadata.version).toBe('1.0.0');
    expect(parsed.scene.node1.id).toBe('node1');
  });

  it('should strip internal properties like localMatrix', () => {
    const projectWithInternals = {
      scene: {
        node1: {
          id: 'node1',
          name: 'My Node',
          type: 'rect',
          parentId: null,
          children: [],
          x: 10,
          y: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          localMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], // internal
          worldMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], // internal
          isDirty: true // internal
        }
      },
      animations: [],
      metadata: {
        version: '1.0.0',
        duration: 5000
      }
    };

    const serialized = validateAndSerializeProject(projectWithInternals);
    const parsed = JSON.parse(serialized);
    expect(parsed.scene.node1.localMatrix).toBeUndefined();
    expect(parsed.scene.node1.worldMatrix).toBeUndefined();
    expect(parsed.scene.node1.isDirty).toBeUndefined();
  });

  it('should reject malformed projects missing required metadata', () => {
    const invalidProject = {
      scene: {},
      animations: [],
      // metadata is missing!
    };

    expect(() => validateAndSerializeProject(invalidProject)).toThrow();
  });

  it('should reject malformed projects with invalid node types', () => {
    const invalidProject = {
      scene: {
        node1: {
          id: 'node1',
          name: 'My Node',
          type: 'unknown_type', // Invalid type
          parentId: null,
          children: [],
          x: 10,
          y: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
        }
      },
      animations: [],
      metadata: {
        version: '1.0.0',
        duration: 5000
      }
    };

    expect(() => validateAndSerializeProject(invalidProject)).toThrow();
  });
});
