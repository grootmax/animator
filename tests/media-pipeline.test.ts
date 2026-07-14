import { test } from 'node:test';
import * as assert from 'node:assert';
import { createSceneGraphStore } from '../packages/scene-graph/src/store';
import { NodeRegistry } from '../packages/renderer/src/registry';
import { SyncEngine } from '../packages/animation-engine/src/sync';
import { AnimationEngine } from '../packages/animation-engine/src/engine';

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id as unknown as NodeJS.Timeout);
}

test('NodeRegistry - can register and resolve node handlers', () => {
  const handler = {
    type: 'custom',
    create: () => ({}),
    update: () => {}
  };
  NodeRegistry.register(handler);
  assert.ok(NodeRegistry.hasHandler('custom'));
  assert.strictEqual(NodeRegistry.getHandler('custom'), handler);
});

test('SceneGraphStore - can manage assets and custom node types', () => {
  const store = createSceneGraphStore();
  
  store.getState().addAsset({
    id: 'vid-1',
    src: 'file:///tmp/video.mp4',
    type: 'video',
    loaded: true
  });
  
  assert.strictEqual(store.getState().assets['vid-1'].src, 'file:///tmp/video.mp4');
  
  store.getState().addNode({
    id: 'node-1',
    type: 'video',
    assetId: 'vid-1'
  });
  
  assert.strictEqual(store.getState().nodes['node-1'].assetId, 'vid-1');
});

test('SyncEngine - correctly syncs HTMLVideoElement with global clock', () => {
  const store = createSceneGraphStore();
  
  // Mock a video element
  let played = false;
  let paused = false;
  const mockVideoElement = {
    currentTime: 0,
    paused: true,
    play: async function() { played = true; paused = false; this.paused = false; },
    pause: function() { paused = true; played = false; this.paused = true; }
  };
  
  store.getState().addAsset({
    id: 'vid-1',
    src: 'file:///tmp/video.mp4',
    type: 'video',
    loaded: true,
    element: mockVideoElement as any
  });
  
  const engine = new AnimationEngine(store);
  
  engine.play(); // Playhead starts moving
  engine.seek(1000); // Seek to 1s
  
  assert.ok(played, 'Video should be playing when engine plays');
  assert.strictEqual(mockVideoElement.currentTime, 1, 'Video currentTime should be synced to playhead in seconds');
  
  engine.pause();
  assert.ok(paused, 'Video should be paused when engine pauses');
});
