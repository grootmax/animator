import type { MotionDocument } from "./types.js";

export function saveProject(doc: MotionDocument): string {
  // Serialize MotionDocument with keyframe timing and layer durations preserved
  return JSON.stringify(doc, null, 2);
}

export function loadProject(jsonString: string): MotionDocument {
  const parsed = JSON.parse(jsonString) as MotionDocument;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid project document format");
  }

  // Ensure layers and tracks are structured properly
  if (!Array.isArray(parsed.layers)) {
    parsed.layers = [];
  }

  for (const layer of parsed.layers) {
    layer.in = typeof layer.in === "number" ? layer.in : 0;
    layer.out =
      typeof layer.out === "number" ? layer.out : parsed.canvas?.duration || 4;
    layer.tracks = layer.tracks || {};

    for (const [prop, track] of Object.entries(layer.tracks)) {
      if (!track.keyframes || !Array.isArray(track.keyframes)) {
        track.keyframes = [];
      } else {
        // Sort keyframes by time
        track.keyframes.sort((a, b) => a.t - b.t);
      }
      track.prop = prop;
    }
  }

  return parsed;
}
