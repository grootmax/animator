import { createSceneGraphStore, SceneNode } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

let store: ReturnType<typeof createSceneGraphStore>;
let engine: AnimationEngine;
let bridge: PixiBridge;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT': {
      const { canvas } = payload;
      store = createSceneGraphStore();
      engine = new AnimationEngine(store);
      bridge = new PixiBridge(canvas, store, true);
      break;
    }
    case 'LOAD': {
      const data = payload;
      
      if (data.scene) {
        Object.values(data.scene).forEach((node: any) => {
          store.getState().addNode(node);
        });
        store.getState().recalculateMatrices();
      }

      if (data.metadata?.duration) {
        engine.setDuration(data.metadata.duration);
      }

      if (data.animations) {
        data.animations.forEach((track: Track) => {
          engine.addTrack(track);
        });
      }
      break;
    }
    case 'PLAY': {
      engine.play();
      break;
    }
    case 'PAUSE': {
      engine.pause();
      break;
    }
    case 'SEEK': {
      engine.seek(payload.time);
      break;
    }
    case 'DESTROY': {
      engine.pause();
      if (bridge) bridge.destroy();
      break;
    }
  }
};
