import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine } from './engine';

export class SyncEngine {
  private store: ReturnType<typeof createSceneGraphStore>;
  private engine: AnimationEngine;
  private driftThreshold = 1 / 30; // About 1 frame at 30fps

  constructor(store: ReturnType<typeof createSceneGraphStore>, engine: AnimationEngine) {
    this.store = store;
    this.engine = engine;
  }

  public update() {
    const isPlaying = this.engine.getIsPlaying();
    const playheadSec = this.engine.getPlayhead() / 1000;
    
    const state = this.store.getState();
    const assets = state.assets;

    for (const assetId in assets) {
      const asset = assets[assetId];
      if (asset.type === 'video' && asset.element && (typeof HTMLVideoElement !== 'undefined' ? asset.element instanceof HTMLVideoElement : (asset.element as any).play)) {
        const video = asset.element as any;
        
        if (isPlaying) {
          if (video.paused) {
            video.play().catch((e: any) => console.warn('SyncEngine: play blocked', e));
          }
          
          // Check for drift
          const drift = Math.abs(video.currentTime - playheadSec);
          if (drift > this.driftThreshold) {
            video.currentTime = playheadSec;
          }
        } else {
          if (!video.paused) {
            video.pause();
          }
          // When scrubbed or paused, force exactly to playhead
          if (Math.abs(video.currentTime - playheadSec) > 0.001) {
            video.currentTime = playheadSec;
          }
        }
      }
    }
  }
}
