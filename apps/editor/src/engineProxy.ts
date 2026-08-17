import { Track } from '@monorepo/animation-engine';

export class EngineProxy {
    private worker: Worker;
    private duration = 5000;
    private tracks: Track[] = [];
    private isPlaying = false;
    private playhead = 0;

    constructor(worker: Worker) {
        this.worker = worker;
    }

    getDuration() { return this.duration; }
    getTracks() { return this.tracks; }
    getIsPlaying() { return this.isPlaying; }
    getPlayhead() { return this.playhead; }

    setDuration(d: number) { this.duration = d; }
    setTracks(tracks: Track[]) { this.tracks = tracks; }

    addTrack(track: Track) {
        this.tracks.push(track);
        this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'addTrack', track });
    }

    play() {
        this.isPlaying = true;
        this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'play' });
    }

    pause() {
        this.isPlaying = false;
        this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'pause' });
    }

    seek(time: number) {
        this.playhead = time;
        this.worker.postMessage({ type: 'ENGINE_CMD', cmd: 'seek', time });
    }

    // Called by worker message
    syncState(isPlaying: boolean, playhead: number) {
        this.isPlaying = isPlaying;
        this.playhead = playhead;
    }
}
