import { describe, it, expect, vi } from 'vitest';
import { Ticker } from '../ticker';
import { AnimationEngine } from '../engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

describe('Ticker', () => {
  it('steps exactly by the given fps in fixed mode', () => {
    const onTick = vi.fn();
    const ticker = new Ticker(onTick, 60, 'fixed');
    
    // 60fps = 16.6666... ms
    const expectedStep = 1000 / 60;
    
    ticker.update(expectedStep * 2.5);
    
    // Should tick 2 times, remaining 0.5 step accumulated
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenNthCalledWith(1, expectedStep, true);
    expect(onTick).toHaveBeenNthCalledWith(2, expectedStep, false);
  });

  it('emits a single tick in realtime mode for the exact dt', () => {
    const onTick = vi.fn();
    const ticker = new Ticker(onTick, 60, 'realtime');
    
    ticker.update(42);
    
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(42, false);
  });

  it('can step manually', () => {
    const onTick = vi.fn();
    const ticker = new Ticker(onTick, 60, 'realtime');
    
    ticker.step(100);
    expect(onTick).toHaveBeenCalledWith(100, false);
    
    ticker.step();
    expect(onTick).toHaveBeenCalledWith(1000 / 60, false);
  });
});

describe('AnimationEngine', () => {
  it('eliminates redundant scene-graph sync calls during catch-up logic frames', () => {
    const store = createSceneGraphStore();
    const storeUpdateSpy = vi.spyOn(store.getState(), 'updateNode');
    const storeRecalcSpy = vi.spyOn(store.getState(), 'recalculateMatrices');

    const engine = new AnimationEngine(store);
    engine.ticker.playbackMode = 'fixed';
    
    engine.addTrack({
      nodeId: 'node1',
      property: 'x',
      keyframes: [
        { time: 0, value: 0 },
        { time: 100, value: 100 }
      ]
    });

    // Advance by exactly 3 frames worth of time (3 * 16.666ms = 50ms)
    // Ticker fixed mode will emit 3 updates:
    // tick 1: deferSync=true
    // tick 2: deferSync=true
    // tick 3: deferSync=false
    engine.ticker.update((1000 / 60) * 3);

    // It should only update the store and recalculate matrices ONCE for the final frame
    expect(storeUpdateSpy).toHaveBeenCalledTimes(1);
    expect(storeRecalcSpy).toHaveBeenCalledTimes(1);

    // Final playhead should be exactly 50ms
    expect(engine.getPlayhead()).toBeCloseTo(50);
  });

  it('toggles correctly between fixed and realtime modes', () => {
    const store = createSceneGraphStore();
    const engine = new AnimationEngine(store);
    
    expect(engine.ticker.playbackMode).toBe('realtime');
    
    engine.ticker.playbackMode = 'fixed';
    expect(engine.ticker.playbackMode).toBe('fixed');
  });

  it('correctly updates nodes without deferSync on seek', () => {
    const store = createSceneGraphStore();
    const storeUpdateSpy = vi.spyOn(store.getState(), 'updateNode');
    
    const engine = new AnimationEngine(store);
    engine.addTrack({
      nodeId: 'node1',
      property: 'x',
      keyframes: [
        { time: 0, value: 0 },
        { time: 100, value: 100 }
      ]
    });

    engine.seek(50);

    expect(engine.getPlayhead()).toBe(50);
    expect(storeUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
