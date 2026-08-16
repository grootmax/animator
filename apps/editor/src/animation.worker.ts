import { AnimationEngine } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

const store = createSceneGraphStore();
const engine = new AnimationEngine(store);

engine.onTick = (nodes, playhead) => {
  self.postMessage({ type: 'TICK', nodes, playhead });
};

self.onmessage = (e) => {
  const data = e.data;
  switch (data.type) {
    case 'INIT': {
      store.setState({ nodes: data.nodes, rootId: data.rootId });
      engine.setTracks(data.tracks);
      engine.setDuration(data.duration);
      break;
    }
    case 'SYNC_NODES': {
      store.setState({ nodes: data.nodes, rootId: data.rootId });
      break;
    }
    case 'PLAY':
      engine.play();
      self.postMessage({ type: 'PLAY_STATE', isPlaying: true });
      break;
    case 'PAUSE':
      engine.pause();
      self.postMessage({ type: 'PLAY_STATE', isPlaying: false });
      break;
    case 'SEEK':
      engine.seek(data.time);
      break;
    case 'SET_DURATION':
      engine.setDuration(data.duration);
      break;
    case 'ADD_TRACK':
      engine.addTrack(data.track);
      break;
  }
};
