import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export class WorkerEngineProxy extends AnimationEngine {
  private worker: Worker;

  constructor(store: ReturnType<typeof createSceneGraphStore>, worker: Worker) {
    super(store);
    this.worker = worker;
    
    // Listen for sync from worker
    this.worker.addEventListener('message', (e) => {
        const { type, isPlaying, playhead, tracks } = e.data;
        if (type === 'state-sync' || type === 'play-state') {
            if (isPlaying !== undefined) {
               // Update local play state without triggering super.play() loop
               (this as any).isPlaying = isPlaying;
            }
            if (playhead !== undefined) {
               (this as any).playhead = playhead;
            }
        }
        if (type === 'track-sync') {
            super.setTracks(tracks);
        }
    });
  }

  public override play() {
    this.worker.postMessage({ type: 'play' });
    (this as any).isPlaying = true;
  }

  public override pause() {
    this.worker.postMessage({ type: 'pause' });
    (this as any).isPlaying = false;
  }

  public override seek(time: number) {
    this.worker.postMessage({ type: 'seek', time });
    (this as any).playhead = time;
  }

  public override addTrack(track: Track) {
    super.addTrack(track); // Keep local for UI
    this.worker.postMessage({ type: 'add-track', track });
  }
}
