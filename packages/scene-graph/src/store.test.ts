import { test } from 'node:test';
import assert from 'node:assert';
import { createSceneGraphStore } from './store.js';

test('reorderNode prevents setting a node as a child of itself', () => {
  const store = createSceneGraphStore();
  store.getState().addNode({ id: 'parent', type: 'container', parentId: null });
  
  // Attempt to make parent its own parent
  store.getState().reorderNode('parent', 'parent', 0);
  
  assert.strictEqual(store.getState().nodes['parent'].parentId, null);
});

test('reorderNode prevents circular reference cycles', () => {
  const store = createSceneGraphStore();
  store.getState().addNode({ id: 'root', type: 'container', parentId: null });
  store.getState().addNode({ id: 'nodeA', type: 'group', parentId: 'root' });
  store.getState().addNode({ id: 'nodeB', type: 'rect', parentId: 'nodeA' });
  store.getState().addNode({ id: 'nodeC', type: 'rect', parentId: 'nodeB' });

  // Attempt to move nodeA under nodeC (which would create cycle A -> C -> B -> A)
  store.getState().reorderNode('nodeA', 'nodeC', 0);

  // Assert nodeA's parent is still 'root' and move was blocked
  assert.strictEqual(store.getState().nodes['nodeA'].parentId, 'root');
});

test('recalculateMatrices handles matrix propagation and guards against unparented nodes', () => {
  const store = createSceneGraphStore();
  store.getState().addNode({ id: 'root', type: 'container', parentId: null, x: 10, y: 20 });
  store.getState().addNode({ id: 'child', type: 'rect', parentId: 'root', x: 5, y: 5 });

  store.getState().recalculateMatrices();

  const childWorldMatrix = store.getState().nodes['child'].worldMatrix;
  assert.ok(childWorldMatrix);
  assert.strictEqual(childWorldMatrix[6], 15); // x: 10 + 5
  assert.strictEqual(childWorldMatrix[7], 25); // y: 20 + 5
});
