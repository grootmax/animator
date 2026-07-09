export interface NetworkCommand {
  type: 'play' | 'pause' | 'seek';
  scheduledStartTime: number;
  playhead?: number;
}

export class NetworkClock {
  private offset: number = 0;
  private rtt: number = 0;

  public sync(t0: number, t1: number, t2: number, t3: number) {
    const rtt = (t3 - t0) - (t2 - t1);
    const offset = ((t1 - t0) + (t2 - t3)) / 2;
    
    this.offset = this.offset === 0 ? offset : this.offset * 0.8 + offset * 0.2;
    this.rtt = this.rtt === 0 ? rtt : this.rtt * 0.8 + rtt * 0.2;
  }

  public get time(): number {
    return performance.now() + this.offset;
  }

  public get estimatedRTT(): number {
    return this.rtt;
  }
}
