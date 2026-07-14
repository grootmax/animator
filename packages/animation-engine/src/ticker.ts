export type PlaybackMode = 'realtime' | 'fixed';

export class Ticker {
  public fps: number;
  public playbackMode: PlaybackMode;
  private accumulator: number = 0;
  private onTick: (dt: number, deferSync: boolean) => void;

  constructor(
    onTick: (dt: number, deferSync: boolean) => void,
    fps: number = 60,
    playbackMode: PlaybackMode = 'realtime'
  ) {
    this.onTick = onTick;
    this.fps = fps;
    this.playbackMode = playbackMode;
  }

  public get timeStep() {
    return 1000 / this.fps;
  }

  public update(dt: number) {
    if (this.playbackMode === 'fixed') {
      this.accumulator += dt;
      const steps: number[] = [];
      const ts = this.timeStep;
      
      while (this.accumulator + 0.001 >= ts) {
        steps.push(ts);
        this.accumulator -= ts;
      }
      
      for (let i = 0; i < steps.length; i++) {
        const isLast = i === steps.length - 1;
        this.onTick(steps[i], !isLast); // deferSync is true for intermediate steps
      }
    } else {
      this.onTick(dt, false);
    }
  }

  public step(customStep?: number) {
    const dt = customStep !== undefined ? customStep : this.timeStep;
    this.onTick(dt, false);
  }
}
