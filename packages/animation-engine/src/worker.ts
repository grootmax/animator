import { Track, Keyframe, EasingType } from './types';
import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';

let tracks: Track[] = [];
let playhead = 0;
let isPlaying = false;
let loop = true;
let duration = 5000;
let lastTime = 0;
let intervalId: any = null;

const getEasingFunction = (type: EasingType = 'linear') => {
  switch (type) {
    case 'easeInQuad': return easeInQuad;
    case 'easeOutQuad': return easeOutQuad;
    case 'easeInOutQuad': return easeInOutQuad;
    default: return linear;
  }
};

const binarySearchKeyframes = (keyframes: Keyframe[], time: number): [Keyframe | null, Keyframe | null] => {
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
};

const calculateUpdates = () => {
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

  return updates;
};

const tick = () => {
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
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  }

  const updates = calculateUpdates();
  
  // Convert Map to Object to send over postMessage
  const updatesObj: Record<string, any> = {};
  for (const [key, val] of updates.entries()) {
    updatesObj[key] = val;
  }

  self.postMessage({
    type: 'TICK',
    payload: {
      playhead,
      isPlaying,
      updates: updatesObj
    }
  });
};

self.onmessage = (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'SET_TRACKS':
      tracks = payload;
      break;
    case 'SET_DURATION':
      duration = payload;
      break;
    case 'SET_LOOP':
      loop = payload;
      break;
    case 'PLAY':
      if (!isPlaying) {
        isPlaying = true;
        lastTime = performance.now();
        if (intervalId === null) {
          // 60fps target
          intervalId = setInterval(tick, 1000 / 60);
        }
      }
      break;
    case 'PAUSE':
      isPlaying = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;
    case 'SEEK':
      playhead = payload;
      const updates = calculateUpdates();
      const updatesObj: Record<string, any> = {};
      for (const [key, val] of updates.entries()) {
        updatesObj[key] = val;
      }
      self.postMessage({
        type: 'SEEK_UPDATE',
        payload: {
          playhead,
          updates: updatesObj
        }
      });
      break;
  }
};

