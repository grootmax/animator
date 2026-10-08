import type {
  AnimationEvent,
  AnimationEventBus,
  RetimeEvent,
  TrimEvent,
} from "./eventBus.js";

export interface Keyframe {
  id?: string;
  t: number;
  v?: number | number[];
  ease?: string;
}

export interface Track {
  id: string;
  layerId: string;
  prop: string;
  keyframes: Keyframe[];
}

export interface LayerTrim {
  layerId: string;
  trimIn: number;
  trimOut: number;
}

export interface SceneDocument {
  id?: string;
  name?: string;
  retiming?: {
    tracks: Record<string, Keyframe[]>;
    trims: Record<string, { trimIn: number; trimOut: number }>;
    updatedAt: number;
  };
  [key: string]: unknown;
}

export class AnimationEngine {
  private tracks: Map<string, Track> = new Map();
  private layerTrims: Map<string, LayerTrim> = new Map();
  private lastSequenceIds: Map<string, number> = new Map();
  private busSubscription?: (() => void) | undefined;
  private sceneDocument: SceneDocument | null = null;

  constructor(eventBus?: AnimationEventBus, sceneDocument?: SceneDocument) {
    this.sceneDocument = sceneDocument || null;
    if (eventBus) {
      this.attachEventBus(eventBus);
    }
  }

  attachEventBus(eventBus: AnimationEventBus): void {
    if (this.busSubscription) {
      this.busSubscription();
    }
    this.busSubscription = eventBus.subscribe((event) => {
      this.handleEvent(event);
    });
  }

  detachEventBus(): void {
    if (this.busSubscription) {
      this.busSubscription();
      this.busSubscription = undefined;
    }
  }

  handleEvent(event: AnimationEvent): boolean {
    const prop =
      event.type === "ANIMATION_RETIME" ? event.prop || "default" : "trim";
    const seqKey = `${event.layerId}:${prop}`;

    const lastSeq = this.lastSequenceIds.get(seqKey) ?? -1;
    if (event.sequenceId <= lastSeq) {
      // Out-of-order message dropped
      return false;
    }
    this.lastSequenceIds.set(seqKey, event.sequenceId);

    if (event.type === "ANIMATION_RETIME") {
      return this.processRetime(event);
    }
    if (event.type === "LAYER_TRIM") {
      return this.processTrim(event);
    }
    return false;
  }

  private processRetime(event: RetimeEvent): boolean {
    const prop = event.prop || "default";
    const trackKey = `${event.layerId}:${prop}`;

    const keyframeIndex = event.keyframeIndex ?? 0;
    if (keyframeIndex < 0) return false;

    // Validate newTime
    if (
      typeof event.newTime !== "number" ||
      Number.isNaN(event.newTime) ||
      event.newTime < 0
    ) {
      return false;
    }

    let track = this.tracks.get(trackKey);
    let isNewTrack = false;
    if (!track) {
      isNewTrack = true;
      track = {
        id: trackKey,
        layerId: event.layerId,
        prop,
        keyframes: [
          { t: event.oldTime !== undefined ? event.oldTime : 0, v: 0 },
        ],
      };
    }

    const updatedKeyframes = track.keyframes.map((k) => ({ ...k }));
    if (keyframeIndex < updatedKeyframes.length) {
      const current = updatedKeyframes[keyframeIndex];
      if (current) {
        current.t = event.newTime;
      }
    } else {
      updatedKeyframes.push({ t: event.newTime, v: 0 });
    }

    // Validate all keyframes in track
    for (const kf of updatedKeyframes) {
      if (typeof kf.t !== "number" || Number.isNaN(kf.t) || kf.t < 0) {
        return false;
      }
    }

    // Sort keyframes by time t to maintain track keyframe array integrity
    updatedKeyframes.sort((a, b) => a.t - b.t);

    track.keyframes = updatedKeyframes;
    if (isNewTrack) {
      this.tracks.set(trackKey, track);
    }

    this.syncToSceneDocument();
    return true;
  }

  private processTrim(event: TrimEvent): boolean {
    const current = this.getLayerTrim(event.layerId);

    const newTrimIn =
      event.trimIn !== undefined ? event.trimIn : current.trimIn;
    const newTrimOut =
      event.trimOut !== undefined ? event.trimOut : current.trimOut;

    if (
      typeof newTrimIn !== "number" ||
      typeof newTrimOut !== "number" ||
      Number.isNaN(newTrimIn) ||
      Number.isNaN(newTrimOut) ||
      newTrimIn < 0 ||
      newTrimOut <= newTrimIn
    ) {
      return false;
    }

    this.layerTrims.set(event.layerId, {
      layerId: event.layerId,
      trimIn: newTrimIn,
      trimOut: newTrimOut,
    });

    this.syncToSceneDocument();
    return true;
  }

  getTrack(layerId: string, prop = "default"): Track | undefined {
    return this.tracks.get(`${layerId}:${prop}`);
  }

  getTracks(): Track[] {
    return Array.from(this.tracks.values());
  }

  setTrack(layerId: string, prop: string, keyframes: Keyframe[]): void {
    const valid = keyframes.every(
      (k) => typeof k.t === "number" && !Number.isNaN(k.t) && k.t >= 0,
    );
    if (!valid) return;
    const sorted = [...keyframes]
      .map((k) => ({ ...k }))
      .sort((a, b) => a.t - b.t);
    const trackKey = `${layerId}:${prop}`;
    this.tracks.set(trackKey, {
      id: trackKey,
      layerId,
      prop,
      keyframes: sorted,
    });
    this.syncToSceneDocument();
  }

  getLayerTrim(layerId: string): LayerTrim {
    return this.layerTrims.get(layerId) || { layerId, trimIn: 0, trimOut: 10 };
  }

  setLayerTrim(layerId: string, trimIn: number, trimOut: number): void {
    if (trimIn >= 0 && trimOut > trimIn) {
      this.layerTrims.set(layerId, { layerId, trimIn, trimOut });
      this.syncToSceneDocument();
    }
  }

  syncToSceneDocument(): void {
    if (!this.sceneDocument) return;
    if (!this.sceneDocument.retiming) {
      this.sceneDocument.retiming = {
        tracks: {},
        trims: {},
        updatedAt: Date.now(),
      };
    }

    const tracksObj: Record<string, Keyframe[]> = {};
    for (const [key, track] of this.tracks.entries()) {
      tracksObj[key] = track.keyframes.map((k) => ({ ...k }));
    }

    const trimsObj: Record<string, { trimIn: number; trimOut: number }> = {};
    for (const [layerId, trim] of this.layerTrims.entries()) {
      trimsObj[layerId] = { trimIn: trim.trimIn, trimOut: trim.trimOut };
    }

    this.sceneDocument.retiming = {
      tracks: tracksObj,
      trims: trimsObj,
      updatedAt: Date.now(),
    };
  }

  saveProject(): SceneDocument | null {
    this.syncToSceneDocument();
    return this.sceneDocument;
  }
}
