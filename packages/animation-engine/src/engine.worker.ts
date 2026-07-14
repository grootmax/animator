import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';

export interface Keyframe {
  time: number;
  value: number;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity';
  keyframes: Keyframe[];
}

const store = createSceneGraphStore();
let tracks: Track[] = [];
let playhead = 0;
let isPlaying = false;
let lastTime = 0;
let rafId: any = null;
let loop = true;
let duration = 5000;

function getEasingFunction(type: EasingType = 'linear') {
  switch (type) {
    case 'easeInQuad': return easeInQuad;
    case 'easeOutQuad': return easeOutQuad;
    case 'easeInOutQuad': return easeInOutQuad;
    default: return linear;
  }
}

function binarySearchKeyframes(keyframes: Keyframe[], time: number): [Keyframe | null, Keyframe | null] {
  if (keyframes.length === 0) return [null, null];
  if (time <= keyframes[0].time) return [keyframes[0], keyframes[0]];
  if (time >= keyframes[keyframes.length - 1].time) return [keyframes[keyframes.length - 1], keyframes[keyframes.length - 1]];

  let low = 0;
  let high = keyframes.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (keyframes[mid].time === time) return [keyframes[mid], keyframes[mid]];
    if (keyframes[mid].time < time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return [keyframes[high], keyframes[low]];
}

function updateNodes() {
  const updates = new Map<string, any>();

  for (const track of tracks) {
    const [start, end] = binarySearchKeyframes(track.keyframes, playhead);
    if (!start || !end) continue;

    let value = start.value;
    if (start !== end) {
      const progress = (playhead - start.time) / (end.time - start.time);
      const easingFn = getEasingFunction(start.easing);
      const easedProgress = easingFn(progress);
      value = start.value + (end.value - start.value) * easedProgress;
    }

    if (!updates.has(track.nodeId)) {
      updates.set(track.nodeId, {});
    }
    updates.get(track.nodeId)[track.property] = value;
  }

  const storeState = store.getState();
  let requiresMatrixUpdate = false;

  for (const [nodeId, nodeUpdates] of updates.entries()) {
    storeState.updateNode(nodeId, nodeUpdates);
    requiresMatrixUpdate = true;
  }

  if (requiresMatrixUpdate) {
    storeState.recalculateMatrices();
  }

  // Collect the final calculated data to send back
  const updatedNodesState = store.getState().nodes;
  const deltaUpdates = [];

  for (const [nodeId, nodeUpdates] of updates.entries()) {
    const nodeState = updatedNodesState[nodeId];
    if (nodeState) {
      deltaUpdates.push({
        id: nodeId,
        updates: nodeUpdates,
        localMatrix: nodeState.localMatrix,
        worldMatrix: nodeState.worldMatrix,
        isDirty: nodeState.isDirty
      });
    }
  }

  if (deltaUpdates.length > 0) {
    self.postMessage({ type: 'DELTA_UPDATES', payload: deltaUpdates });
  }
}

function tick() {
  if (!isPlaying) return;

  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;

  playhead += dt;

  if (playhead > duration) {
    if (loop) {
      playhead = playhead % duration;
    } else {
      playhead = duration;
      isPlaying = false;
      self.postMessage({ type: 'STOPPED', payload: { playhead } });
      return;
    }
  }

  updateNodes();
  self.postMessage({ type: 'PLAYHEAD_UPDATE', payload: { playhead } });

  if (isPlaying) {
    if (typeof requestAnimationFrame !== 'undefined') {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = setTimeout(tick, 16);
    }
  }
}

self.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'SYNC_SCENE': {
      // Sync the whole scene graph nodes
      store.setState({ nodes: msg.payload.nodes, rootId: msg.payload.rootId });
      break;
    }
    case 'SET_TRACKS': {
      tracks = msg.payload.tracks;
      break;
    }
    case 'ADD_TRACK': {
      const track = msg.payload.track;
      track.keyframes.sort((a: Keyframe, b: Keyframe) => a.time - b.time);
      tracks.push(track);
      break;
    }
    case 'PLAY': {
      if (isPlaying) return;
      isPlaying = true;
      lastTime = performance.now();
      tick();
      break;
    }
    case 'PAUSE': {
      isPlaying = false;
      if (rafId !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(rafId);
        } else {
          clearTimeout(rafId);
        }
        rafId = null;
      }
      break;
    }
    case 'SEEK': {
      playhead = msg.payload.time;
      updateNodes();
      self.postMessage({ type: 'PLAYHEAD_UPDATE', payload: { playhead } });
      break;
    }
    case 'SET_DURATION': {
      duration = msg.payload.duration;
      break;
    }
  }
};
