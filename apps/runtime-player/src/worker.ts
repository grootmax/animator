import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { PixiBridge } from '@monorepo/renderer';

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
      // Very crude virtualization for worker
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
    case 'init': {
      const { canvas } = payload;
      store = createSceneGraphStore();
      engine = new AnimationEngine(store);
      // PixiBridge will use the offscreen canvas
      bridge = new PixiBridge(canvas, store);
      break;
    }
    case 'load': {
      const { data } = payload;
      if (data.scene) {
        Object.values(data.scene).forEach(node => {
          store.getState().addNode(node as any);
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
    case 'play': {
      engine.play();
      break;
    }
    case 'pause': {
      engine.pause();
      break;
    }
    case 'seek': {
      engine.seek(payload.time);
      break;
    }
    case 'updateNode': {
      const { id, updates } = payload;
      store.getState().updateNode(id, updates);
      store.getState().recalculateMatrices();
      break;
    }
    case 'interaction': {
      // Route pointer events to the PixiBridge container
      if (bridge && (bridge as any).viewport) {
        const { eventType, eventData } = payload;
        const viewport = (bridge as any).viewport;
        if (eventType === 'pointerdown') {
          viewport.container.emit('pointerdown', eventData);
        } else if (eventType === 'pointermove') {
          viewport.container.emit('pointermove', eventData);
        } else if (eventType === 'pointerup') {
          viewport.container.emit('pointerup', eventData);
        }
      }
      break;
    }
  }
};
