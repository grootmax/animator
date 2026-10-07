import { describe, it, expect } from 'vitest';
import { createSceneGraphStore } from './store';

describe('SceneGraphStore matrix recalculation & dirty propagation', () => {
  it('recalculates local and world matrices for root and child nodes in place', () => {
    const store = createSceneGraphStore();
    const { addNode, updateNode, recalculateMatrices } = store.getState();

    addNode({ id: 'root', type: 'container', x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0 });
    addNode({ id: 'child1', type: 'rect', parentId: 'root', x: 20, y: 10, scaleX: 2, scaleY: 2, rotation: 0 });

    const rootBefore = store.getState().nodes['root'];
    const childBefore = store.getState().nodes['child1'];

    expect(rootBefore.isDirty).toBe(true);
    expect(childBefore.isDirty).toBe(true);

    const rootLocalRef = rootBefore.localMatrix;
    const rootWorldRef = rootBefore.worldMatrix;
    const childLocalRef = childBefore.localMatrix;
    const childWorldRef = childBefore.worldMatrix;

    recalculateMatrices();

    const rootAfter = store.getState().nodes['root'];
    const childAfter = store.getState().nodes['child1'];

    expect(rootAfter.isDirty).toBe(false);
    expect(childAfter.isDirty).toBe(false);

    // Ensure matrix references were mutated in place
    expect(rootAfter.localMatrix).toBe(rootLocalRef);
    expect(rootAfter.worldMatrix).toBe(rootWorldRef);
    expect(childAfter.localMatrix).toBe(childLocalRef);
    expect(childAfter.worldMatrix).toBe(childWorldRef);

    // Verify root matrix translated to (100, 50)
    expect(rootAfter.localMatrix[6]).toBe(100);
    expect(rootAfter.localMatrix[7]).toBe(50);

    // Verify child world matrix combines root (100, 50) + child local (20, 10)
    expect(childAfter.worldMatrix[6]).toBe(120);
    expect(childAfter.worldMatrix[7]).toBe(60);
  });

  it('spatial update marks node dirty and recalculates world matrix for descendants', () => {
    const store = createSceneGraphStore();
    const { addNode, updateNode, recalculateMatrices } = store.getState();

    addNode({ id: 'root', type: 'container', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    addNode({ id: 'child', type: 'rect', parentId: 'root', x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 });

    recalculateMatrices();

    // Update root spatial property (x)
    updateNode('root', { x: 200 });
    expect(store.getState().nodes['root'].isDirty).toBe(true);

    recalculateMatrices();

    const childAfter = store.getState().nodes['child'];
    expect(childAfter.worldMatrix[6]).toBe(250);
    expect(childAfter.worldMatrix[7]).toBe(50);
  });
});
