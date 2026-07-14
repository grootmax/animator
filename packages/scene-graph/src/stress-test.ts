import { createSceneGraphStore, SceneNode, NodeType } from './store.js';
import { getTransformMatrix } from '@monorepo/math';

function runNormalization() {
  let temp;
  const start = performance.now();
  for (let i = 0; i < 1_000_000; i++) {
    temp = getTransformMatrix(0.1, 0.2, 0.5, 1, 1, 0, 0);
  }
  const end = performance.now();
  return end - start;
}

function runStressTest() {
  console.log('Running normalization benchmark...');
  const currentNormMs = runNormalization();
  console.log(`Normalization took: ${currentNormMs.toFixed(2)}ms`);

  const BASELINE_TARGET_MS = 1300;
  const BASELINE_NORM_MS = 1280; // Approximate normalization time when target was set
  
  // Adjusted baseline based on the current machine's performance
  const adjustedBaselineMs = BASELINE_TARGET_MS * (currentNormMs / BASELINE_NORM_MS);
  console.log(`Adjusted baseline for this machine: ${adjustedBaselineMs.toFixed(2)}ms`);

  const store = createSceneGraphStore();
  
  const NUM_NODES = 100000;
  
  console.log(`Generating ${NUM_NODES} nodes...`);
  const nodes: Array<Partial<Omit<SceneNode, 'localMatrix' | 'worldMatrix' | 'isDirty'>> & { id: string, type: NodeType }> = [];
  
  // Root node
  nodes.push({ id: 'root', type: 'container', parentId: null });
  
  for (let i = 1; i < NUM_NODES; i++) {
    nodes.push({
      id: `node-${i}`,
      type: 'rect',
      parentId: 'root',
      x: i * 0.1,
      y: i * 0.1,
      rotation: i * 0.01,
      scaleX: 1,
      scaleY: 1
    });
  }
  
  console.log('Inserting nodes in bulk...');
  const startInsert = performance.now();
  store.getState().addNodesBulk(nodes);
  const endInsert = performance.now();
  console.log(`Bulk insertion took ${(endInsert - startInsert).toFixed(2)}ms`);
  
  console.log('Recalculating matrices...');
  const startRecalc = performance.now();
  store.getState().recalculateMatrices();
  const endRecalc = performance.now();
  const recalcTime = endRecalc - startRecalc;
  console.log(`Matrix recalculation took ${recalcTime.toFixed(2)}ms`);

  const deltaPercent = ((recalcTime - adjustedBaselineMs) / adjustedBaselineMs) * 100;
  console.log(`Performance Delta: ${deltaPercent.toFixed(2)}%`);

  if (deltaPercent > 5) {
    console.error(`\n❌ ERROR: Matrix recalculation time increased by more than 5% (Delta: ${deltaPercent.toFixed(2)}%)`);
    process.exit(1);
  } else {
    console.log(`\n✅ SUCCESS: Matrix recalculation performance is within acceptable bounds.`);
  }
}

runStressTest();
