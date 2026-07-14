export interface VirtualClock {
  now(): number;
}

export class SystemClock implements VirtualClock {
  public now(): number {
    return performance.now();
  }
}

export class ManualClock implements VirtualClock {
  private time: number;

  constructor(initialTime = 0) {
    this.time = initialTime;
  }

  public now(): number {
    return this.time;
  }

  public advance(dt: number): void {
    this.time += dt;
  }

  public setTime(time: number): void {
    this.time = time;
  }
}
