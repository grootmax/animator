import { AnimatorError } from "./errors.js";
import { getPresetTouchedProperties, roundTime } from "./presets.js";
import type {
  AnimProp,
  LayerNode,
  OverlapCollision,
  ValidationResult,
} from "./types.js";

interface PropertyInterval {
  sourceName: string;
  sourceType: "preset" | "keyframe";
  property: AnimProp;
  start: number;
  end: number;
}

export function validateNodeOverlaps(node: LayerNode): ValidationResult {
  const collisions: OverlapCollision[] = [];
  const errors: AnimatorError[] = [];

  const propertyIntervals = new Map<AnimProp, PropertyInterval[]>();

  function addInterval(interval: PropertyInterval) {
    const existing = propertyIntervals.get(interval.property) ?? [];
    existing.push(interval);
    propertyIntervals.set(interval.property, existing);
  }

  if (node.presets && node.presets.length > 0) {
    for (const preset of node.presets) {
      const touchedProps = getPresetTouchedProperties(preset.name);
      const start = roundTime(preset.at);
      const end = roundTime(preset.at + preset.duration);

      for (const prop of touchedProps) {
        addInterval({
          sourceName: preset.name,
          sourceType: "preset",
          property: prop,
          start,
          end,
        });
      }
    }
  }

  if (node.keyframes) {
    for (const [propKey, kfs] of Object.entries(node.keyframes)) {
      if (kfs && kfs.length > 1) {
        const prop = propKey as AnimProp;
        const times = kfs.map((k) => k.t).sort((a, b) => a - b);
        const start = roundTime(times[0] ?? 0);
        const end = roundTime(times[times.length - 1] ?? 0);
        addInterval({
          sourceName: "rawKeyframes",
          sourceType: "keyframe",
          property: prop,
          start,
          end,
        });
      }
    }
  }

  for (const [prop, intervals] of propertyIntervals.entries()) {
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const a = intervals[i];
        const b = intervals[j];
        if (!a || !b) {
          continue;
        }

        const overlapStart = roundTime(Math.max(a.start, b.start));
        const overlapEnd = roundTime(Math.min(a.end, b.end));

        if (overlapStart < overlapEnd) {
          const collision: OverlapCollision = {
            nodeId: node.id,
            property: prop,
            overlapWindow: { start: overlapStart, end: overlapEnd },
            presetA: {
              name: a.sourceName,
              range: { start: a.start, end: a.end },
            },
            presetB: {
              name: b.sourceName,
              range: { start: b.start, end: b.end },
            },
            message: `Property collision detected on node '${node.id}' for property '${prop}'. '${a.sourceName}' (${a.start}s–${a.end}s) overlaps with '${b.sourceName}' (${b.start}s–${b.end}s) in range ${overlapStart}s–${overlapEnd}s.`,
            hint: `Adjust timing for '${a.sourceName}' or '${b.sourceName}' on node '${node.id}' so their time windows do not overlap on property '${prop}'.`,
          };

          collisions.push(collision);

          errors.push(
            new AnimatorError(collision.message, "PROPERTY_OVERLAP", {
              path: `layers[${node.id}].presets`,
              hint: collision.hint,
            }),
          );
        }
      }
    }
  }

  return {
    valid: collisions.length === 0,
    collisions,
    errors,
  };
}

export function validateDocOverlaps(doc: {
  layers: LayerNode[];
}): ValidationResult {
  const allCollisions: OverlapCollision[] = [];
  const allErrors: AnimatorError[] = [];

  for (const layer of doc.layers) {
    const res = validateNodeOverlaps(layer);
    if (!res.valid) {
      allCollisions.push(...res.collisions);
      allErrors.push(...res.errors);
    }
  }

  return {
    valid: allCollisions.length === 0,
    collisions: allCollisions,
    errors: allErrors,
  };
}
