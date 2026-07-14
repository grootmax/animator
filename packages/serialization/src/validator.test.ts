import { describe, it, expect } from 'vitest';
import { ProjectValidator } from './validator';

describe('ProjectValidator', () => {
  it('parses valid JSON string', () => {
    const validJson = '{"key": "value"}';
    expect(ProjectValidator.parseAndValidateJSON(validJson)).toEqual({ key: 'value' });
  });

  it('throws error for invalid JSON string', () => {
    const invalidJson = '{key: "value"}';
    expect(() => ProjectValidator.parseAndValidateJSON(invalidJson)).toThrow('Invalid JSON Syntax');
  });

  it('validates project structure successfully', () => {
    const validData = {
      scene: { node1: { id: 'node1', type: 'rect' } },
      animations: [],
    };
    expect(ProjectValidator.validateStructure(validData)).toBe(true);
  });

  it('throws error if root is not object', () => {
    expect(() => ProjectValidator.validateStructure(null)).toThrow('Invalid Project Structure: Root must be an object');
    expect(() => ProjectValidator.validateStructure("string")).toThrow('Invalid Project Structure: Root must be an object');
  });

  it('throws error if scene is missing or invalid', () => {
    expect(() => ProjectValidator.validateStructure({ animations: [] })).toThrow('Invalid Project Structure: Missing scene configuration');
    expect(() => ProjectValidator.validateStructure({ scene: null, animations: [] })).toThrow('Invalid Project Structure: Scene must be an object');
  });

  it('throws error if animations is missing or not an array', () => {
    expect(() => ProjectValidator.validateStructure({ scene: {} })).toThrow('Invalid Project Structure: Missing animation sequences');
    expect(() => ProjectValidator.validateStructure({ scene: {}, animations: {} })).toThrow('Invalid Project Structure: Animations must be an array');
  });

  it('cleans scene nodes by removing internal matrix and dirty flags', () => {
    const rawNodes = {
      n1: { id: 'n1', x: 10, localMatrix: [1, 0, 0, 1, 0, 0], worldMatrix: [1, 0, 0, 1, 0, 0], isDirty: true },
    };
    const cleaned = ProjectValidator.cleanScene(rawNodes);
    expect(cleaned).toEqual({
      n1: { id: 'n1', x: 10 },
    });
  });

  it('validates string end-to-end', () => {
    const validStr = JSON.stringify({ scene: {}, animations: [] });
    expect(ProjectValidator.validateString(validStr)).toEqual({ scene: {}, animations: [] });
  });
});
