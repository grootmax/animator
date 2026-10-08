import { AnimatorError } from "./errors.js";
import type {
  AnimProp,
  EaseName,
  Keyframe,
  LayerNode,
  PresetRef,
  PropertyTrack,
  StaggerConfig,
} from "./types.js";

export function roundTime(val: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export function getPresetTouchedProperties(presetName: string): AnimProp[] {
  switch (presetName) {
    case "fadeIn":
    case "fadeOut":
      return ["opacity"];
    case "slideUp":
    case "slideOutUp":
      return ["position"];
    case "pop":
    case "pulse":
      return ["scale"];
    case "drawOn":
      return ["trim.end"];
    default:
      return [];
  }
}

export function expandPreset(
  preset: PresetRef,
  node?: LayerNode,
): PropertyTrack[] {
  const { name, at, duration, params = {} } = preset;
  if (duration <= 0) {
    throw new AnimatorError(
      `Preset '${name}' must have a positive duration. Received: ${duration}`,
      "INVALID_PRESET_DURATION",
      { hint: "Set duration to a value greater than 0 seconds." },
    );
  }

  const startT = roundTime(at);
  const endT = roundTime(at + duration);

  switch (name) {
    case "fadeIn": {
      const startOpacity = (params.startOpacity as number) ?? 0;
      const endOpacity = (params.endOpacity as number) ?? node?.opacity ?? 100;
      const ease = (params.ease as EaseName) ?? "easeOutCubic";
      return [
        {
          property: "opacity",
          keyframes: [
            { t: startT, v: startOpacity, ease },
            { t: endT, v: endOpacity },
          ],
        },
      ];
    }

    case "fadeOut": {
      const startOpacity =
        (params.startOpacity as number) ?? node?.opacity ?? 100;
      const endOpacity = (params.endOpacity as number) ?? 0;
      const ease = (params.ease as EaseName) ?? "easeInCubic";
      return [
        {
          property: "opacity",
          keyframes: [
            { t: startT, v: startOpacity, ease },
            { t: endT, v: endOpacity },
          ],
        },
      ];
    }

    case "slideUp": {
      const distance = (params.distance as number) ?? 60;
      const [baseX, baseY] = (params.basePosition as [number, number]) ??
        node?.position ?? [0, 0];
      const ease = (params.ease as EaseName) ?? "easeOutCubic";
      return [
        {
          property: "position",
          keyframes: [
            { t: startT, v: [baseX, baseY + distance], ease },
            { t: endT, v: [baseX, baseY] },
          ],
        },
      ];
    }

    case "slideOutUp": {
      const distance = (params.distance as number) ?? 60;
      const [baseX, baseY] = (params.basePosition as [number, number]) ??
        node?.position ?? [0, 0];
      const ease = (params.ease as EaseName) ?? "easeInCubic";
      return [
        {
          property: "position",
          keyframes: [
            { t: startT, v: [baseX, baseY], ease },
            { t: endT, v: [baseX, baseY - distance] },
          ],
        },
      ];
    }

    case "pop": {
      const targetScale = (params.targetScale as [number, number]) ??
        node?.scale ?? [100, 100];
      const ease = (params.ease as EaseName) ?? "easeOutBack";
      return [
        {
          property: "scale",
          keyframes: [
            { t: startT, v: [0, 0], ease },
            { t: endT, v: targetScale },
          ],
        },
      ];
    }

    case "pulse": {
      const [baseX, baseY] = (params.baseScale as [number, number]) ??
        node?.scale ?? [100, 100];
      const scaleFactor =
        params.scale !== undefined ? (params.scale as number) / 100 : 1.1;
      const peakScale: [number, number] = [
        baseX * scaleFactor,
        baseY * scaleFactor,
      ];
      const ease = (params.ease as EaseName) ?? "easeInOutQuad";
      const midT = roundTime(at + duration * 0.5);

      return [
        {
          property: "scale",
          keyframes: [
            { t: startT, v: [baseX, baseY], ease },
            { t: midT, v: peakScale, ease },
            { t: endT, v: [baseX, baseY] },
          ],
        },
      ];
    }

    case "drawOn": {
      const ease = (params.ease as EaseName) ?? "easeOutExpo";
      return [
        {
          property: "trim.end",
          keyframes: [
            { t: startT, v: 0, ease },
            { t: endT, v: 100 },
          ],
        },
      ];
    }

    default:
      throw new AnimatorError(
        `Unknown preset name '${name}'.`,
        "UNKNOWN_PRESET",
        {
          hint: "Supported presets are fadeIn, slideUp, pop, drawOn, fadeOut, slideOutUp, pulse.",
        },
      );
  }
}

export function applyStagger(
  stagger: StaggerConfig,
  nodes?: LayerNode[],
): {
  presetMap: Map<string, PresetRef>;
  updatedNodes?: LayerNode[];
} {
  const {
    targets,
    at,
    step,
    preset,
    params = {},
    duration: staggerDuration,
  } = stagger;

  const presetName = typeof preset === "string" ? preset : preset.name;
  const presetDuration =
    typeof preset === "object" ? preset.duration : (staggerDuration ?? 0.5);
  const baseParams = typeof preset === "object" ? preset.params : {};

  const presetMap = new Map<string, PresetRef>();

  for (let index = 0; index < targets.length; index++) {
    const targetId = targets[index];
    if (targetId) {
      const presetRef: PresetRef = {
        name: presetName,
        at: roundTime(at + index * step),
        duration: presetDuration,
        params: { ...baseParams, ...params },
      };
      presetMap.set(targetId, presetRef);
    }
  }

  if (nodes) {
    const updatedNodes = nodes.map((node) => {
      const appliedPreset = presetMap.get(node.id);
      if (!appliedPreset) {
        return node;
      }
      const existingPresets = node.presets ?? [];
      return {
        ...node,
        presets: [...existingPresets, appliedPreset],
      };
    });

    return { presetMap, updatedNodes };
  }

  return { presetMap };
}

export function expandLayerPresets(
  node: LayerNode,
): Partial<Record<AnimProp, Keyframe[]>> {
  const result: Partial<Record<AnimProp, Keyframe[]>> = {
    ...node.keyframes,
  };

  if (!node.presets || node.presets.length === 0) {
    return result;
  }

  for (const preset of node.presets) {
    const tracks = expandPreset(preset, node);
    for (const track of tracks) {
      const existing = result[track.property] ?? [];
      const combined = [...existing, ...track.keyframes].sort(
        (a, b) => a.t - b.t,
      );
      result[track.property] = combined;
    }
  }

  return result;
}
