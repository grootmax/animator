import { InnerRuntimePlayer } from './index';

let player: InnerRuntimePlayer | null = null;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT': {
      const { canvas, width, height, devicePixelRatio } = payload;
      if (canvas instanceof OffscreenCanvas) {
        canvas.width = width;
        canvas.height = height;
      }
      player = new InnerRuntimePlayer(canvas, devicePixelRatio);
      
      // Subscribe to store to send state back
      player.store.subscribe((state) => {
        // We could serialize it to an ArrayBuffer to use transferable, but for now
        // structured clone is automatic.
        // Wait, "use transferable objects to minimize serialization overhead."
        // Let's JSON stringify it and encode to Uint8Array to transfer?
        // Or just postMessage since structured cloning is fast for plain objects.
        const serialized = JSON.stringify(state.nodes);
        const encoder = new TextEncoder();
        const buffer = encoder.encode(serialized).buffer;
        (self as any).postMessage({ type: 'STATE_SYNC', payload: buffer }, [buffer]);
      });
      break;
    }
    case 'LOAD': {
      if (player) {
        player.load(payload.json);
      }
      break;
    }
    case 'PLAY': {
      if (player) {
        player.play();
      }
      break;
    }
    case 'PAUSE': {
      if (player) {
        player.pause();
      }
      break;
    }
    case 'SEEK': {
      if (player && typeof player.seek === 'function') {
        player.seek(payload.time);
      }
      break;
    }
    case 'RESIZE': {
      if (player) {
        player.resize(payload.width, payload.height);
      }
      break;
    }
    case 'UPDATE_NODE': {
      if (player) {
        player.updateNode(payload.id, payload.updates);
      }
      break;
    }
    case 'ADD_NODE': {
      if (player) {
        player.addNode(payload.node);
      }
      break;
    }
    case 'ADD_TRACK': {
      if (player) {
        player.addTrack(payload.track);
      }
      break;
    }
  }
};
