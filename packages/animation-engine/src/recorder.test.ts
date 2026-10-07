import { describe, it, expect, vi } from 'vitest';
import { Recorder } from './recorder';
import { AnimationEngine } from './engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

describe('Recorder', () => {
  it('captures frame sequence deterministically', async () => {
    const store = createSceneGraphStore();
    const engine = new AnimationEngine(store);
    engine.setDuration(100); // 100ms duration

    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,mockdata')
    } as unknown as HTMLCanvasElement;

    const renderTrigger = vi.fn();
    const onFrame = vi.fn();

    const recorder = new Recorder({
      engine,
      canvas: mockCanvas,
      fps: 20, // 20 fps -> step size = 50ms, for 100ms duration = 2 frames (0ms, 50ms)
      duration: 100,
      onFrame,
      renderTrigger
    });

    const frames = await recorder.captureSequence();

    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe('data:image/png;base64,mockdata');
    expect(frames[1]).toBe('data:image/png;base64,mockdata');

    expect(renderTrigger).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenCalledWith(0, 'data:image/png;base64,mockdata');
    expect(onFrame).toHaveBeenCalledWith(1, 'data:image/png;base64,mockdata');
  });

  it('restores playhead and playing state after capture', async () => {
    const store = createSceneGraphStore();
    const engine = new AnimationEngine(store);
    engine.setDuration(100);
    engine.seek(33.34);

    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,mock')
    } as unknown as HTMLCanvasElement;

    const renderTrigger = vi.fn();

    const recorder = new Recorder({
      engine,
      canvas: mockCanvas,
      fps: 20,
      renderTrigger
    });

    await recorder.captureSequence();

    expect(engine.getPlayhead()).toBeCloseTo(33.34, 1);
    expect(engine.getIsPlaying()).toBe(false);
  });
});
