import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

let store: ReturnType<typeof createSceneGraphStore>;
let engine: AnimationEngine;
let bridge: PixiBridge;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      store = createSceneGraphStore();
      engine = new AnimationEngine(store);
      bridge = new PixiBridge({
        canvas: payload.canvas,
        width: payload.width,
        height: payload.height,
        devicePixelRatio: payload.devicePixelRatio
      }, store);
      break;

    case 'LOAD':
      const data = payload;
      // Load scene
      if (data.scene) {
        Object.values(data.scene).forEach((node: any) => {
          store.getState().addNode(node);
        });
        store.getState().recalculateMatrices();
      }

      // Load metadata and animations
      if (data.metadata?.duration) {
        engine.setDuration(data.metadata.duration);
      }

      if (data.animations) {
        data.animations.forEach((track: Track) => {
          engine.addTrack(track);
        });
      }
      break;

    case 'PLAY':
      engine.play();
      break;

    case 'PAUSE':
      engine.pause();
      break;

    case 'SEEK':
      engine.seek(payload.time);
      break;

    case 'RESIZE':
      bridge.resize(payload.width, payload.height);
      break;

    case 'UPDATE_NODE':
      store.getState().updateNode(payload.nodeId, payload.updates);
      store.getState().recalculateMatrices();
      break;

    case 'DOM_EVENT':
      bridge.emitEvent(payload.eventName, payload.eventData);
      break;
  }
};
