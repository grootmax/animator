export type RetimeEvent = {
  type: "ANIMATION_RETIME";
  layerId: string;
  prop?: string;
  keyframeIndex?: number;
  oldTime?: number;
  newTime: number;
  sequenceId: number;
  senderId?: string;
};

export type TrimEvent = {
  type: "LAYER_TRIM";
  layerId: string;
  trimIn?: number;
  trimOut?: number;
  sequenceId: number;
  senderId?: string;
};

export type AnimationEvent = RetimeEvent | TrimEvent;

export type AnimationEventListener = (event: AnimationEvent) => void;

export class AnimationEventBus {
  private listeners: Set<AnimationEventListener> = new Set();
  private busId: string;

  constructor(busId?: string) {
    this.busId = busId || Math.random().toString(36).substring(2, 9);
  }

  get id(): string {
    return this.busId;
  }

  publish(event: AnimationEvent): void {
    const eventWithSender: AnimationEvent = {
      ...event,
      senderId: event.senderId || this.busId,
    };
    for (const listener of Array.from(this.listeners)) {
      listener(eventWithSender);
    }
  }

  emit(event: AnimationEvent): void {
    this.publish(event);
  }

  subscribe(listener: AnimationEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  receive(event: AnimationEvent): void {
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }
}
