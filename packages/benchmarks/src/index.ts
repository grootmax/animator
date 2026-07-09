import { createSceneGraphStore, NodeType } from '@monorepo/scene-graph';
import { createMatrix, multiplyMatrix, getTransformMatrix } from '@monorepo/math';
import * as fs from 'fs';

const RUNS = 10;
const DEFAULT_ITERATIONS = 10000;

function measure(name: string, fn: () => void, iterations: number = DEFAULT_ITERATIONS): number {
  // Warmup
  for (let i = 0; i < iterations / 10; i++) fn();

  const times: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // ms
  }

  times.sort((a, b) => a - b);
  // Remove 2 min and 2 max to reduce variance
  const validTimes = times.slice(2, -2);
  const avg = validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length;

  console.log(`[Benchmark] ${name}: ${avg.toFixed(3)} ms`);
  return avg;
}

// 1. Math Utils Benchmark
const mathResults: Record<string, number> = {};

const m1 = createMatrix();
const m2 = getTransformMatrix(10, 20, 0.5, 2, 2, 0.1, 0.1);

mathResults['multiplyMatrix'] = measure('Math: multiplyMatrix', () => {
  multiplyMatrix(m1, m2);
}, 1000000);

mathResults['getTransformMatrix'] = measure('Math: getTransformMatrix', () => {
  getTransformMatrix(10, 20, 0.5, 2, 2, 0.1, 0.1);
}, 1000000);

// 2. Scene Graph Benchmark
const store = createSceneGraphStore();
store.getState().addNode({ id: 'root', type: 'container' as NodeType });

// Create a deep hierarchy
let parentId = 'root';
for (let i = 0; i < 1000; i++) {
  const id = `node_${i}`;
  store.getState().addNode({ id, type: 'rect' as NodeType, parentId, x: 1, y: 1, rotation: 0.1, scaleX: 1.01, scaleY: 1.01 });
  parentId = id;
}

mathResults['recalculateMatrices'] = measure('SceneGraph: recalculateMatrices (Deep hierarchy 1000 nodes)', () => {
  store.getState().markDirty('root');
  store.getState().recalculateMatrices();
}, 1000);

// Save results
const outputPath = process.argv[2] || 'benchmark-results.json';
fs.writeFileSync(outputPath, JSON.stringify(mathResults, null, 2));
console.log(`Results saved to ${outputPath}`);
