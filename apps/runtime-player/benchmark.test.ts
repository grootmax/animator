import { vi, test, expect } from 'vitest';

// Mock PIXI entirely
vi.mock('pixi.js', () => {
  class MockContainer {
    interactive = false;
    visible = true;
    alpha = 1;
    children: any[] = [];
    x = 0;
    y = 0;
    scale = { x: 1, y: 1 };
    toLocal = () => ({ x: 0, y: 0 });
    addChild(child: any) { this.children.push(child); }
    removeChild() {}
    on() {}
    setTransform() {}
  }
  
  class MockGraphics extends MockContainer {
    clear() {}
    beginFill() {}
    endFill() {}
    lineStyle() {}
    drawRect() {}
    drawCircle() {}
    drawEllipse() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    closePath() {}
  }

  return {
    Application: class {
      stage = new MockContainer();
      ticker = { add: () => {} };
      renderer = { width: 800, height: 600, screen: { width: 800, height: 600 } };
      view = { addEventListener: () => {}, removeEventListener: () => {} };
    },
    Container: MockContainer,
    Graphics: MockGraphics,
  };
});

import { PixiBridge } from '@monorepo/renderer';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine } from '@monorepo/animation-engine';

// Mock global dependencies
(global as any).window = { devicePixelRatio: 1, innerWidth: 1000, innerHeight: 1000, addEventListener: () => {}, removeEventListener: () => {} };
(global as any).document = { addEventListener: () => {}, removeEventListener: () => {} };
(global as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
(global as any).cancelAnimationFrame = (id: any) => clearTimeout(id);

test('100,000 node benchmark', () => {
  const store = createSceneGraphStore();
  const bridge = new PixiBridge({ addEventListener: () => {}, removeEventListener: () => {} } as any, store);
  const engine = new AnimationEngine(store);
  
  // 1. Setup Time
  const startTime = performance.now();
  
  const nodes = [];
  nodes.push({ id: "root", type: "container", parentId: null });
  for (let i = 0; i < 100000; i++) {
    nodes.push({
      id: `node-${i}`,
      type: 'rect' as const,
      parentId: "root",
      x: i % 800,
      y: Math.floor(i / 800),
      width: 10,
      height: 10,
    });
  }
  
  // Use the new bulkAddNodes
  store.getState().bulkAddNodes(nodes);
  store.getState().recalculateMatrices();
  
  const setupTime = performance.now() - startTime;
  console.log(`Setup time: ${setupTime.toFixed(2)}ms`);
  expect(setupTime).toBeLessThan(2000); // Acceptance criteria: under 2 seconds
  
  store.setState({ lastUpdated: [] });
  // 2. Measure synchronization time / frame time
  // Wait, bridge subscribes to store. So when we update nodes, it syncs.
  // Let's manually trigger a frame update to see the sync time.
  const syncStart = performance.now();
  store.getState().updateNode('node-0', { x: 100 });
  const preRecalc = performance.now();
  store.getState().recalculateMatrices();
  const syncTime = performance.now() - syncStart;
  console.log(`recalculateMatrices took: ${(performance.now() - preRecalc).toFixed(2)}ms`);
  console.log(`Sync time: ${syncTime.toFixed(2)}ms`);
  
  // The frame rate for 100k node benchmark must not fall below 55fps.
  // 55fps = ~18.18ms per frame.
  // So the total time for updateNode + recalculateMatrices (which triggers subscriber in bridge) must be < 18.18ms
  expect(syncTime).toBeLessThan(18.18);
});
