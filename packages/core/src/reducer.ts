import type { Keyframe, MotionDoc, MotionPatch, MotionState } from "./types.js";

function parseHexColor(hex: string): [number, number, number, number] | null {
  const clean = hex.replace("#", "");
  if (clean.length === 6) {
    const r = Number.parseInt(clean.substring(0, 2), 16);
    const g = Number.parseInt(clean.substring(2, 4), 16);
    const b = Number.parseInt(clean.substring(4, 6), 16);
    return [r, g, b, 255];
  }
  if (clean.length === 8) {
    const r = Number.parseInt(clean.substring(0, 2), 16);
    const g = Number.parseInt(clean.substring(2, 4), 16);
    const b = Number.parseInt(clean.substring(4, 6), 16);
    const a = Number.parseInt(clean.substring(6, 8), 16);
    return [r, g, b, a];
  }
  return null;
}

function formatHexColor(rgba: [number, number, number, number]): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  if (rgba[3] === 255) {
    return `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`;
  }
  return `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}${toHex(rgba[3])}`;
}

export function interpolateValue(
  v1: unknown,
  v2: unknown,
  factor: number,
): unknown {
  if (typeof v1 === "number" && typeof v2 === "number") {
    return v1 + (v2 - v1) * factor;
  }

  if (Array.isArray(v1) && Array.isArray(v2) && v1.length === v2.length) {
    return v1.map((val, idx) => {
      const targetVal = v2[idx];
      if (typeof val === "number" && typeof targetVal === "number") {
        return val + (targetVal - val) * factor;
      }
      return factor < 0.5 ? val : targetVal;
    });
  }

  if (
    typeof v1 === "string" &&
    typeof v2 === "string" &&
    v1.startsWith("#") &&
    v2.startsWith("#")
  ) {
    const c1 = parseHexColor(v1);
    const c2 = parseHexColor(v2);
    if (c1 && c2) {
      const interpolated: [number, number, number, number] = [
        c1[0] + (c2[0] - c1[0]) * factor,
        c1[1] + (c2[1] - c1[1]) * factor,
        c1[2] + (c2[2] - c1[2]) * factor,
        c1[3] + (c2[3] - c1[3]) * factor,
      ];
      return formatHexColor(interpolated);
    }
  }

  return factor < 0.5 ? v1 : v2;
}

export function evaluateKeyframes(
  keyframes: Keyframe[],
  playhead: number,
): unknown {
  if (!keyframes || keyframes.length === 0) return undefined;
  const firstKf = keyframes[0];
  if (!firstKf) return undefined;
  if (keyframes.length === 1) return firstKf.value;

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const startKf = sorted[0];
  const lastKf = sorted[sorted.length - 1];
  if (!startKf || !lastKf) return undefined;

  if (playhead <= startKf.time) return startKf.value;
  if (playhead >= lastKf.time) return lastKf.value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const kf1 = sorted[i];
    const kf2 = sorted[i + 1];
    if (kf1 && kf2 && playhead >= kf1.time && playhead <= kf2.time) {
      if (kf1.easing === "hold") return kf1.value;
      const range = kf2.time - kf1.time;
      const factor = range > 0 ? (playhead - kf1.time) / range : 0;
      return interpolateValue(kf1.value, kf2.value, factor);
    }
  }

  return lastKf.value;
}

export function evaluateNodeProperties(
  doc: MotionDoc,
  playhead: number,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const layer of doc.layers || []) {
    const layerProps: Record<string, unknown> = {};

    if (layer.position !== undefined) layerProps.position = layer.position;
    if (layer.scale !== undefined) layerProps.scale = layer.scale;
    if (layer.rotation !== undefined) layerProps.rotation = layer.rotation;
    if (layer.opacity !== undefined) layerProps.opacity = layer.opacity;

    if (layer.keyframes) {
      for (const [prop, kfs] of Object.entries(layer.keyframes)) {
        if (Array.isArray(kfs) && kfs.length > 0) {
          layerProps[prop] = evaluateKeyframes(kfs, playhead);
        }
      }
    }

    if (layer.tracks) {
      for (const track of layer.tracks) {
        if (track.keyframes && track.keyframes.length > 0) {
          layerProps[track.property] = evaluateKeyframes(
            track.keyframes,
            playhead,
          );
        }
      }
    }

    result[layer.id] = layerProps;
  }

  if (doc.tracks) {
    for (const track of doc.tracks) {
      const targetProps = result[track.targetId] ?? {};
      result[track.targetId] = targetProps;
      if (track.keyframes && track.keyframes.length > 0) {
        targetProps[track.property] = evaluateKeyframes(
          track.keyframes,
          playhead,
        );
      }
    }
  }

  return result;
}

export function createInitialMotionState(doc: MotionDoc): MotionState {
  const fps = doc.canvas?.fps || 30;
  return {
    doc,
    playhead: 0,
    isPlaying: false,
    fps,
    nodeProperties: evaluateNodeProperties(doc, 0),
  };
}

export function motionPatchReducer(
  state: MotionState,
  patch: MotionPatch,
): MotionState {
  switch (patch.type) {
    case "SET_PLAYHEAD": {
      const newPlayhead = Math.max(
        0,
        Math.min(
          state.doc.canvas?.duration || Number.POSITIVE_INFINITY,
          patch.playhead,
        ),
      );
      return {
        ...state,
        playhead: newPlayhead,
        nodeProperties: evaluateNodeProperties(state.doc, newPlayhead),
      };
    }

    case "SET_PLAYING": {
      return {
        ...state,
        isPlaying: patch.isPlaying,
      };
    }

    case "TICK": {
      const dt = patch.deltaTime;
      const duration = state.doc.canvas?.duration || 10;
      let nextPlayhead =
        patch.playhead !== undefined ? patch.playhead : state.playhead + dt;
      if (nextPlayhead >= duration) {
        nextPlayhead = nextPlayhead % duration;
      }
      return {
        ...state,
        playhead: nextPlayhead,
        nodeProperties: evaluateNodeProperties(state.doc, nextPlayhead),
      };
    }

    case "UPDATE_NODE_PROPERTY": {
      const newLayers = state.doc.layers.map((layer) => {
        if (layer.id === patch.nodeId) {
          return { ...layer, [patch.property]: patch.value };
        }
        return layer;
      });
      const newDoc: MotionDoc = { ...state.doc, layers: newLayers };
      return {
        ...state,
        doc: newDoc,
        nodeProperties: evaluateNodeProperties(newDoc, state.playhead),
      };
    }

    case "UPDATE_KEYFRAME":
    case "ADD_KEYFRAME": {
      const { layerId, property, keyframe, trackId } = patch;
      const newLayers = state.doc.layers.map((layer) => {
        if (layerId && layer.id === layerId && property) {
          const currentKfs = layer.keyframes?.[property] || [];
          const filtered = currentKfs.filter((k) => k.id !== keyframe.id);
          const updatedKfs = [...filtered, keyframe].sort(
            (a, b) => a.time - b.time,
          );
          return {
            ...layer,
            keyframes: {
              ...layer.keyframes,
              [property]: updatedKfs,
            },
          };
        }
        return layer;
      });

      const newDoc: MotionDoc = { ...state.doc, layers: newLayers };
      return {
        ...state,
        doc: newDoc,
        nodeProperties: evaluateNodeProperties(newDoc, state.playhead),
      };
    }

    case "REMOVE_KEYFRAME": {
      const { layerId, property, keyframeId } = patch;
      const newLayers = state.doc.layers.map((layer) => {
        if (
          layerId &&
          layer.id === layerId &&
          property &&
          layer.keyframes?.[property]
        ) {
          const updatedKfs = layer.keyframes[property].filter(
            (k) => k.id !== keyframeId,
          );
          return {
            ...layer,
            keyframes: {
              ...layer.keyframes,
              [property]: updatedKfs,
            },
          };
        }
        return layer;
      });

      const newDoc: MotionDoc = { ...state.doc, layers: newLayers };
      return {
        ...state,
        doc: newDoc,
        nodeProperties: evaluateNodeProperties(newDoc, state.playhead),
      };
    }

    case "SET_DOC": {
      return {
        ...state,
        doc: patch.doc,
        fps: patch.doc.canvas?.fps || 30,
        nodeProperties: evaluateNodeProperties(patch.doc, state.playhead),
      };
    }

    default:
      return state;
  }
}
