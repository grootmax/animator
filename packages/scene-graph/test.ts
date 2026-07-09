import { createSceneGraphStore } from './src/store';

const store = createSceneGraphStore();

let emissionCount = 0;

// Subscribe to store emissions
store.subscribe(() => {
  emissionCount++;
});

// Setup: Create Root Node
store.getState().addNode({
  id: 'root',
  type: 'container',
  x: 0,
  y: 0
});

// Setup: Create 100 nodes
const childIds = [];
for (let i = 0; i < 100; i++) {
  const id = `node-${i}`;
  childIds.push(id);
  store.getState().addNode({
    id,
    type: 'rect',
    x: 10,
    y: 10,
    parentId: 'root'
  });
}

// Reset emission count after setup
emissionCount = 0;

// Test Requirement: Grouping 100 nodes results in exactly one store emission
store.getState().createGroup('group-1', childIds, 'root', 0);

if (emissionCount !== 1) {
  console.error(`FAILED: Expected exactly 1 emission, got ${emissionCount}`);
  process.exit(1);
} else {
  console.log('SUCCESS: Grouping 100 nodes resulted in exactly one store emission.');
}

// Test Matrix Calculation
const state = store.getState();
const groupNode = state.nodes['group-1'];
const firstChild = state.nodes['node-0'];

if (groupNode.children.length !== 100) {
  console.error(`FAILED: Expected group to have 100 children, got ${groupNode.children.length}`);
  process.exit(1);
}

// Check matrix calculation
// When the group is created and nodes reparented, the transaction calls recalculateMatrices.
// node-0 should have its matrix updated based on group-1's matrix.
// Since group-1 has x=0, y=0 (default) and node-0 has x=10, y=10
if (firstChild.worldMatrix[6] !== 10 || firstChild.worldMatrix[7] !== 10) {
  console.error('FAILED: Matrix recalculation is incorrect.');
  console.error('firstChild world matrix:', firstChild.worldMatrix);
  process.exit(1);
} else {
  console.log('SUCCESS: Matrices correctly recalculated.');
}

// Test Requirement: Bulk reparenting emits only once
const newFolderId = 'folder-1';
store.getState().addNode({
  id: newFolderId,
  type: 'container',
  x: 20,
  y: 20,
  parentId: 'root'
});

emissionCount = 0;
store.getState().reparentNodes(['group-1'], newFolderId, 0);

if (emissionCount !== 1) {
  console.error(`FAILED: Expected exactly 1 emission during reparenting, got ${emissionCount}`);
  process.exit(1);
} else {
  console.log('SUCCESS: Bulk reparenting resulted in exactly one store emission.');
}

// After reparenting, group-1 world matrix and its children should update.
// Group is now at x=20, y=20. node-0 is at x=10, y=10 relative to group-1 (because group-1 has no translation natively yet? Actually group-1 is 0,0, but newFolderId is 20,20).
// Wait, newFolderId is at 20, 20. group-1 is inside newFolderId, so worldMatrix of group-1 translates to 20, 20.
// node-0 inside group-1 inside newFolderId translates to 30, 30.
const updatedFirstChild = store.getState().nodes['node-0'];
if (updatedFirstChild.worldMatrix[6] !== 30 || updatedFirstChild.worldMatrix[7] !== 30) {
  console.error('FAILED: Matrix recalculation after reparenting is incorrect.');
  console.error('updatedFirstChild world matrix:', updatedFirstChild.worldMatrix);
  process.exit(1);
} else {
  console.log('SUCCESS: Matrices correctly recalculated after bulk reparenting.');
}

console.log('ALL TESTS PASSED');
