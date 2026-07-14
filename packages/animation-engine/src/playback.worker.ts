import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '@monorepo/math';
import type { Track, Keyframe, EasingType } from './types';

let tracks: Track[] = [];
let playhead = 0;
let isPlaying = false;
let duration = 5000;
let loop = true;

let lastTime = 0;
let accumulator = 0;
const FIXED_STEP = 1000 / 60; // ~16.66ms per step
let timerId: any = null;

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

function calculateState(currentTime: number) {
  const updates = new Map<string, any>();

  for (const track of tracks) {
    const [start, end] = binarySearchKeyframes(track.keyframes, currentTime);

    if (!start || !end) continue;

    let value = start.value;
    if (start !== end) {
      const progress = (currentTime - start.time) / (end.time - start.time);
      const easingFn = getEasingFunction(start.easing);
      const easedProgress = easingFn(progress);
      value = start.value + (end.value - start.value) * easedProgress;
    }

    if (!updates.has(track.nodeId)) {
      updates.set(track.nodeId, {});
    }
    updates.get(track.nodeId)[track.property] = value;
  }
  
  const updatesObj: Record<string, any> = {};
  for (const [nodeId, nodeUpdates] of updates.entries()) {
    updatesObj[nodeId] = nodeUpdates;
  }
  return updatesObj;
}

function sendState() {
  postMessage({ type: 'STATE_UPDATE', playhead, updates: calculateState(playhead) });
}

function tick() {
  if (!isPlaying) return;

  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;
  
  accumulator += dt;

  let stateUpdated = false;
  // Fixed-step accumulation
  while (accumulator >= FIXED_STEP) {
    playhead += FIXED_STEP;
    accumulator -= FIXED_STEP;
    
    if (playhead > duration) {
      if (loop) {
        playhead = playhead % duration;
      } else {
        playhead = duration;
        isPlaying = false;
      }
    }
    stateUpdated = true;
  }

  if (stateUpdated) {
    sendState();
  }
  
  if (isPlaying) {
    timerId = setTimeout(tick, 10) as any;
  }
}

function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  lastTime = performance.now();
  accumulator = 0;
  tick();
}

function stopPlayback() {
  isPlaying = false;
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function runExport() {
  const exportData = [];
  let currentTime = 0;
  const fps = 60;
  const step = 1000 / fps;
  
  while (currentTime <= duration) {
    exportData.push({
      time: currentTime,
      state: calculateState(currentTime)
    });
    currentTime += step;
  }
  
  postMessage({ type: 'EXPORT_READY', data: exportData });
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  switch (type) {
    case 'INIT':
      tracks = payload.tracks || [];
      duration = payload.duration || 5000;
      loop = payload.loop !== false;
      break;
    case 'PLAY':
      startPlayback();
      break;
    case 'PAUSE':
      stopPlayback();
      break;
    case 'SEEK':
      playhead = payload.time;
      // When seeking, just compute immediately and send.
      sendState();
      break;
    case 'SET_TRACKS':
      tracks = payload.tracks;
      break;
    case 'SET_DURATION':
      duration = payload.duration;
      break;
    case 'EXPORT':
      runExport();
      break;
  }
};
