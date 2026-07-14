import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine, Track } from '@monorepo/animation-engine';

let store: ReturnType<typeof createSceneGraphStore>;
let engine: AnimationEngine;
let bridge: PixiBridge;

// Virtualize requestAnimationFrame if missing
if (typeof self.requestAnimationFrame !== 'function') {
  self.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return self.setTimeout(() => cb(performance.now()), 1000 / 60) as unknown as number;
  };
  self.cancelAnimationFrame = (id: number) => {
    self.clearTimeout(id);
  };
}

// Virtualize DOMParser for SVG Parsing if needed
if (typeof DOMParser === 'undefined') {
  (self as any).DOMParser = class {
    parseFromString(str: string, type: string) {
      return {
        documentElement: { children: [] },
        querySelector: () => null
      } as any;
    }
  };
}

self.onmessage = (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
    case 'init': {
      store = createSceneGraphStore();
      engine = new AnimationEngine(store);
      const canvas = payload.canvas || payload;
      bridge = new PixiBridge({
        canvas: canvas,
        width: payload.width || 800,
        height: payload.height || 600,
        devicePixelRatio: payload.devicePixelRatio || 1
      }, store);
      break;
    }

    case 'LOAD':
    case 'load': {
      const data = payload.data || payload;
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

    case 'PLAY':
    case 'play':
      if (engine) engine.play();
      break;

    case 'PAUSE':
    case 'pause':
      if (engine) engine.pause();
      break;

    case 'SEEK':
    case 'seek':
      if (engine) engine.seek(payload.time);
      break;

    case 'RESIZE':
    case 'resize':
      if (bridge) bridge.resize(payload.width, payload.height);
      break;

    case 'UPDATE_NODE':
    case 'updateNode': {
      const id = payload.nodeId || payload.id;
      const updates = payload.updates;
      if (store) {
        store.getState().updateNode(id, updates);
        store.getState().recalculateMatrices();
      }
      break;
    }

    case 'DOM_EVENT':
      if (bridge) bridge.emitEvent(payload.eventName, payload.eventData);
      break;

    case 'interaction': {
      if (bridge && (bridge as any).viewport) {
        const { eventType, eventData } = payload;
        bridge.emitEvent(eventType, eventData);
      }
      break;
    }
  }
};
