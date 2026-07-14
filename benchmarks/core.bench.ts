import { bench, describe } from 'vitest';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { createMatrix } from '@monorepo/math';

function setupStoreWithNodes(count: number) {
  const store = createSceneGraphStore();
  const nodes: Record<string, any> = {};

  nodes['root'] = {
    id: 'root',
    type: 'container',
    parentId: null,
    children: [],
    name: 'root',
    x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false,
    localMatrix: createMatrix(),
    worldMatrix: createMatrix(),
    isDirty: true
  };

  for (let i = 1; i < count; i++) {
    const parentIdx = Math.floor((i - 1) / 10);
    const parentNodeId = parentIdx === 0 ? 'root' : `node-${parentIdx}`;
    const id = `node-${i}`;

    nodes[id] = {
      id,
      type: 'rect',
      parentId: parentNodeId,
      children: [],
      name: id,
      x: 1, y: 1, rotation: 0.01, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false,
      localMatrix: createMatrix(),
      worldMatrix: createMatrix(),
      isDirty: true
    };
    nodes[parentNodeId].children.push(id);
  }

  // Bulk injection method
  store.setState({ nodes, rootId: 'root' });
  return store;
}

describe('Scene Graph - Matrix Recalculation (Dirty)', () => {
  [1000, 10000, 100000].forEach((nodeCount) => {
    const store = setupStoreWithNodes(nodeCount);

    bench(`recalculateMatrices - ${nodeCount} nodes`, () => {
      // It's already dirty for the first call, but for subsequent iterations
      // tinybench runs this repeatedly. The simplest way to keep it 'dirty' 
      // without reallocating 100k nodes is to force the root dirty? 
      // Actually, if we just want to test dirty traversal, we can just mutate `isDirty` directly
      // to avoid overhead of Zustand state updates in the benchmark loop.
      const state = store.getState();
      const nodes = state.nodes;
      for (const key in nodes) {
        nodes[key].isDirty = true;
      }
      state.recalculateMatrices();
    }, { time: 1000 });
  });
});

describe('Scene Graph - Matrix Recalculation (Clean)', () => {
  [1000, 10000, 100000].forEach((nodeCount) => {
    const store = setupStoreWithNodes(nodeCount);
    store.getState().recalculateMatrices(); // make clean

    bench(`recalculateMatrices (clean) - ${nodeCount} nodes`, () => {
      store.getState().recalculateMatrices();
    }, { time: 1000 });
  });
});

describe('Animation Engine - Track Processing', () => {
  [1000, 10000, 100000].forEach((nodeCount) => {
    const store = setupStoreWithNodes(nodeCount);
    const engine = new AnimationEngine(store);

    const tracks: Track[] = [];
    const numAnimated = Math.max(1, Math.floor(nodeCount * 0.1));
    for (let i = 1; i <= numAnimated; i++) {
      tracks.push({
        nodeId: `node-${i}`,
        property: 'x',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 1000, value: 100, easing: 'linear' }
        ]
      });
    }
    engine.setTracks(tracks);

    bench(`Engine seek and process updates - ${nodeCount} nodes (${numAnimated} tracks)`, () => {
      // Playhead advances by 16ms each time roughly
      engine.seek((engine.getPlayhead() + 16) % 1000);
    }, { time: 1000 });
  });
});
