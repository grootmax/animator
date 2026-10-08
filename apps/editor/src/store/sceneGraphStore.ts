import type {
  AnimationOperation,
  Keyframe,
  Layer,
  MotionDocument,
} from "@animator/core";
import { create } from "zustand";

export function alignToFrameInterval(time: number, fps = 60): number {
  const interval = 1 / fps; // 0.016666... (16.67ms)
  const frames = Math.round(time / interval);
  const aligned = frames * interval;
  return Math.max(0, Math.round(aligned * 1000) / 1000);
}

export interface SceneGraphState {
  document: MotionDocument;
  playheadTime: number;
  selectedLayerId: string | null;

  // Actions
  updateKeyframeTime: (
    layerId: string,
    prop: string,
    keyframeIndex: number,
    newTime: number,
    source?: string | undefined,
  ) => void;
  updateLayerDuration: (
    layerId: string,
    duration: { inTime?: number | undefined; outTime?: number | undefined },
    source?: string | undefined,
  ) => void;
  addKeyframe: (
    layerId: string,
    prop: string,
    keyframe: Keyframe,
    source?: string | undefined,
  ) => void;
  deleteKeyframe: (
    layerId: string,
    prop: string,
    keyframeIndex: number,
    source?: string | undefined,
  ) => void;
  setPlayheadTime: (time: number) => void;
  setSelectedLayerId: (id: string | null) => void;
  applyRemote: (op: AnimationOperation) => void;
  loadProject: (doc: MotionDocument) => void;
  saveProject: () => MotionDocument;
}

export type OperationListener = (op: AnimationOperation) => void;

const listeners: Set<OperationListener> = new Set();

export function subscribeToOperations(listener: OperationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function broadcastOperation(op: AnimationOperation): void {
  for (const listener of listeners) {
    listener(op);
  }
}

const defaultDocument: MotionDocument = {
  version: 1,
  name: "New Project",
  canvas: {
    width: 1080,
    height: 1080,
    fps: 60,
    duration: 4,
    background: "#0B1020",
  },
  layers: [
    {
      id: "layer-1",
      name: "Shape Layer 1",
      type: "shape",
      in: 0,
      out: 4,
      tracks: {
        position: {
          prop: "position",
          keyframes: [
            { t: 0, v: [100, 100] },
            { t: 2, v: [500, 500] },
          ],
        },
      },
    },
  ],
};

export const useSceneGraphStore = create<SceneGraphState>((set, get) => ({
  document: defaultDocument,
  playheadTime: 0,
  selectedLayerId: "layer-1",

  updateKeyframeTime: (layerId, prop, keyframeIndex, newTime, source) => {
    const fps = get().document.canvas?.fps || 60;
    const alignedTime = alignToFrameInterval(newTime, fps);

    set((state) => {
      const layers = state.document.layers.map((layer) => {
        if (layer.id !== layerId) return layer;

        const track = layer.tracks[prop];
        if (!track || !track.keyframes[keyframeIndex]) return layer;

        const newKeyframes = [...track.keyframes];
        const targetKf = newKeyframes[keyframeIndex];
        if (!targetKf) return layer;

        newKeyframes[keyframeIndex] = {
          ...targetKf,
          t: alignedTime,
        };

        // Sort keyframes by time ascending
        newKeyframes.sort((a, b) => a.t - b.t);

        return {
          ...layer,
          tracks: {
            ...layer.tracks,
            [prop]: {
              ...track,
              keyframes: newKeyframes,
            },
          },
        };
      });

      return {
        document: {
          ...state.document,
          layers,
        },
      };
    });

    const op: AnimationOperation = {
      type: "updateKeyframeTime",
      layerId,
      prop,
      keyframeIndex,
      newTime: alignedTime,
      ...(source !== undefined ? { source } : {}),
    };

    if (source !== "remote") {
      broadcastOperation(op);
    }
  },

  updateLayerDuration: (layerId, duration, source) => {
    const fps = get().document.canvas?.fps || 60;
    const alignedIn =
      duration.inTime !== undefined
        ? alignToFrameInterval(duration.inTime, fps)
        : undefined;
    const alignedOut =
      duration.outTime !== undefined
        ? alignToFrameInterval(duration.outTime, fps)
        : undefined;

    set((state) => {
      const layers = state.document.layers.map((layer) => {
        if (layer.id !== layerId) return layer;

        let newIn = alignedIn !== undefined ? alignedIn : layer.in;
        let newOut = alignedOut !== undefined ? alignedOut : layer.out;

        if (newIn > newOut) {
          if (alignedIn !== undefined) newOut = newIn;
          else newIn = newOut;
        }

        return {
          ...layer,
          in: Math.max(0, newIn),
          out: Math.max(0, newOut),
        };
      });

      return {
        document: {
          ...state.document,
          layers,
        },
      };
    });

    const durationObj: {
      inTime?: number | undefined;
      outTime?: number | undefined;
    } = {};
    if (alignedIn !== undefined) durationObj.inTime = alignedIn;
    if (alignedOut !== undefined) durationObj.outTime = alignedOut;

    const op: AnimationOperation = {
      type: "updateLayerDuration",
      layerId,
      duration: durationObj,
      ...(source !== undefined ? { source } : {}),
    };

    if (source !== "remote") {
      broadcastOperation(op);
    }
  },

  addKeyframe: (layerId, prop, keyframe, source) => {
    const fps = get().document.canvas?.fps || 60;
    const alignedKf: Keyframe = {
      ...keyframe,
      t: alignToFrameInterval(keyframe.t, fps),
    };

    set((state) => {
      const layers = state.document.layers.map((layer) => {
        if (layer.id !== layerId) return layer;

        const track = layer.tracks[prop] || { prop, keyframes: [] };
        const newKeyframes = [...track.keyframes, alignedKf].sort(
          (a, b) => a.t - b.t,
        );

        return {
          ...layer,
          tracks: {
            ...layer.tracks,
            [prop]: {
              ...track,
              keyframes: newKeyframes,
            },
          },
        };
      });

      return {
        document: {
          ...state.document,
          layers,
        },
      };
    });

    const op: AnimationOperation = {
      type: "addKeyframe",
      layerId,
      prop,
      keyframe: alignedKf,
      ...(source !== undefined ? { source } : {}),
    };

    if (source !== "remote") {
      broadcastOperation(op);
    }
  },

  deleteKeyframe: (layerId, prop, keyframeIndex, source) => {
    set((state) => {
      const layers = state.document.layers.map((layer) => {
        if (layer.id !== layerId) return layer;

        const track = layer.tracks[prop];
        if (!track) return layer;

        const newKeyframes = track.keyframes.filter(
          (_, idx) => idx !== keyframeIndex,
        );

        return {
          ...layer,
          tracks: {
            ...layer.tracks,
            [prop]: {
              ...track,
              keyframes: newKeyframes,
            },
          },
        };
      });

      return {
        document: {
          ...state.document,
          layers,
        },
      };
    });

    const op: AnimationOperation = {
      type: "deleteKeyframe",
      layerId,
      prop,
      keyframeIndex,
      ...(source !== undefined ? { source } : {}),
    };

    if (source !== "remote") {
      broadcastOperation(op);
    }
  },

  setPlayheadTime: (time) => {
    set({ playheadTime: Math.max(0, time) });
  },

  setSelectedLayerId: (id) => {
    set({ selectedLayerId: id });
  },

  applyRemote: (op) => {
    const {
      updateKeyframeTime,
      updateLayerDuration,
      addKeyframe,
      deleteKeyframe,
    } = get();

    switch (op.type) {
      case "updateKeyframeTime":
        updateKeyframeTime(
          op.layerId,
          op.prop,
          op.keyframeIndex,
          op.newTime,
          "remote",
        );
        break;
      case "updateLayerDuration":
        updateLayerDuration(op.layerId, op.duration, "remote");
        break;
      case "addKeyframe":
        addKeyframe(op.layerId, op.prop, op.keyframe, "remote");
        break;
      case "deleteKeyframe":
        deleteKeyframe(op.layerId, op.prop, op.keyframeIndex, "remote");
        break;
    }
  },

  loadProject: (doc) => {
    set({ document: doc });
  },

  saveProject: () => {
    return get().document;
  },
}));
