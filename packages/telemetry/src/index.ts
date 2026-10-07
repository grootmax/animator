export type Subsystem = 'math' | 'rendering' | 'animation' | 'total';

type TelemetryListener = (measurements: Record<Subsystem, number>) => void;

class Telemetry {
  private measurements: Record<Subsystem, number> = {
    math: 0,
    rendering: 0,
    animation: 0,
    total: 0
  };
  private startTime: Record<Subsystem, number> = {
    math: 0,
    rendering: 0,
    animation: 0,
    total: 0
  };

  private listeners: Set<TelemetryListener> = new Set();
  
  public isEnabled: Record<Subsystem, boolean> = {
    math: true,
    rendering: true,
    animation: true,
    total: true
  };

  public begin(subsystem: Subsystem) {
    if (this.isEnabled[subsystem]) {
      this.startTime[subsystem] = performance.now();
    }
  }

  public end(subsystem: Subsystem) {
    if (this.isEnabled[subsystem]) {
      const duration = performance.now() - this.startTime[subsystem];
      this.measurements[subsystem] = duration;
    }
  }

  public getMeasurements() {
    return { ...this.measurements };
  }

  public subscribe(listener: TelemetryListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify() {
    const data = this.getMeasurements();
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}

export const telemetry = new Telemetry();
