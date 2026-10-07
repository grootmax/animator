import { describe, it, expect } from 'vitest';
import { SystemClock, ManualClock } from './clock';
import { AnimationEngine } from './engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

describe('Clock Abstractions', () => {
  describe('SystemClock', () => {
    it('returns timestamp from performance.now()', () => {
      const clock = new SystemClock();
      const t1 = clock.now();
      expect(typeof t1).toBe('number');
      expect(t1).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ManualClock', () => {
    it('initializes with default or custom initial time', () => {
      const clock1 = new ManualClock();
      expect(clock1.now()).toBe(0);

      const clock2 = new ManualClock(1000);
      expect(clock2.now()).toBe(1000);
    });

    it('advances time when advance(dt) is called', () => {
      const clock = new ManualClock(500);
      clock.advance(250);
      expect(clock.now()).toBe(750);
    });

    it('sets specific time when setTime(t) is called', () => {
      const clock = new ManualClock();
      clock.setTime(1234);
      expect(clock.now()).toBe(1234);
    });
  });

  describe('AnimationEngine Clock & Step Integration', () => {
    it('updates playhead and nodes deterministically via step()', () => {
      const store = createSceneGraphStore();
      const engine = new AnimationEngine(store);
      const clock = new ManualClock(0);
      engine.setClock(clock);

      // Create a node in store
      store.getState().addNode({
        id: 'node-1',
        name: 'Box',
        type: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true
      });

      engine.addTrack({
        nodeId: 'node-1',
        property: 'x',
        keyframes: [
          { id: 'kf-1', time: 0, value: 0, easing: 'linear' },
          { id: 'kf-2', time: 1000, value: 100, easing: 'linear' }
        ]
      });

      expect(engine.getPlayhead()).toBe(0);

      engine.step(500);
      expect(engine.getPlayhead()).toBe(500);

      const node = store.getState().nodes['node-1'];
      expect(node.x).toBe(50);
    });
  });
});
