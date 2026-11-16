import { type Patch, enablePatches, produceWithPatches } from "immer";
import { z } from "zod";
import { AnimatorError } from "./errors.js";
import {
  type Asset,
  AssetSchema,
  type Canvas,
  CanvasSchema,
  type Keyframe,
  KeyframeSchema,
  type Layer,
  LayerSchema,
  type MotionDoc,
  type Param,
  ParamSchema,
  type PresetRef,
  PresetRefSchema,
  type Stagger,
  StaggerSchema,
  type VideoClip,
  VideoClipSchema,
} from "./schema.js";

// Enable Immer patches support once
enablePatches();

export type AnimProp =
  | "position"
  | "scale"
  | "rotation"
  | "opacity"
  | "anchor"
  | "fill"
  | "stroke.color"
  | "stroke.width"
  | "trim.start"
  | "trim.end"
  | "trim.offset"
  | "shape.size"
  | "shape.radius"
  | "shape.d"
  | (string & {});

export type DeepPartial<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends Array<infer U>
    ? _DeepPartialArray<U>
    : T extends object
      ? _DeepPartialObject<T>
      : T;

type _DeepPartialArray<T> = DeepPartial<T>[];
type _DeepPartialObject<T> = { [P in keyof T]?: DeepPartial<T[P]> | undefined };

// --- Op Schemas & Types ---
export const SetCanvasOpSchema = z.object({
  op: z.literal("setCanvas"),
  set: CanvasSchema.partial(),
});
export type SetCanvasOp = {
  op: "setCanvas";
  set: Partial<Canvas>;
};

export const AddLayerOpSchema = z.object({
  op: z.literal("addLayer"),
  layer: LayerSchema,
  parent: z.string().optional(),
  index: z.number().int().optional(),
});
export type AddLayerOp = {
  op: "addLayer";
  layer: Layer;
  parent?: string | undefined;
  index?: number | undefined;
};

export const UpdateLayerOpSchema = z.object({
  op: z.literal("updateLayer"),
  id: z.string().min(1),
  set: z.record(z.string(), z.unknown()),
});
export type UpdateLayerOp = {
  op: "updateLayer";
  id: string;
  set: DeepPartial<Layer>;
};

export const RemoveLayerOpSchema = z.object({
  op: z.literal("removeLayer"),
  id: z.string().min(1),
});
export type RemoveLayerOp = {
  op: "removeLayer";
  id: string;
};

export const MoveLayerOpSchema = z.object({
  op: z.literal("moveLayer"),
  id: z.string().min(1),
  parent: z.string().nullable().optional(),
  index: z.number().int(),
});
export type MoveLayerOp = {
  op: "moveLayer";
  id: string;
  parent?: string | null | undefined;
  index: number;
};

export const SetKeyframesOpSchema = z.object({
  op: z.literal("setKeyframes"),
  id: z.string().min(1),
  prop: z.string().min(1),
  keyframes: z.array(KeyframeSchema).nullable(),
});
export type SetKeyframesOp = {
  op: "setKeyframes";
  id: string;
  prop: AnimProp;
  keyframes: Keyframe[] | null;
};

export const AddPresetOpSchema = z.object({
  op: z.literal("addPreset"),
  id: z.string().min(1),
  preset: PresetRefSchema,
});
export type AddPresetOp = {
  op: "addPreset";
  id: string;
  preset: PresetRef;
};

export const RemovePresetOpSchema = z.object({
  op: z.literal("removePreset"),
  id: z.string().min(1),
  index: z.number().int(),
});
export type RemovePresetOp = {
  op: "removePreset";
  id: string;
  index: number;
};

export const AddStaggerOpSchema = z.object({
  op: z.literal("addStagger"),
  stagger: StaggerSchema,
});
export type AddStaggerOp = {
  op: "addStagger";
  stagger: Stagger;
};

export const SetParamOpSchema = z.object({
  op: z.literal("setParam"),
  name: z.string().min(1),
  param: ParamSchema.nullable(),
});
export type SetParamOp = {
  op: "setParam";
  name: string;
  param: Param | null;
};

export const AddAssetOpSchema = z.object({
  op: z.literal("addAsset"),
  asset: AssetSchema,
});
export type AddAssetOp = {
  op: "addAsset";
  asset: Asset;
};

export const RemoveAssetOpSchema = z.object({
  op: z.literal("removeAsset"),
  id: z.string().min(1),
});
export type RemoveAssetOp = {
  op: "removeAsset";
  id: string;
};

export const SetVideoTrackOpSchema = z.object({
  op: z.literal("setVideoTrack"),
  clips: z.array(VideoClipSchema),
});
export type SetVideoTrackOp = {
  op: "setVideoTrack";
  clips: VideoClip[];
};

export const OpSchema = z.discriminatedUnion("op", [
  SetCanvasOpSchema,
  AddLayerOpSchema,
  UpdateLayerOpSchema,
  RemoveLayerOpSchema,
  MoveLayerOpSchema,
  SetKeyframesOpSchema,
  AddPresetOpSchema,
  RemovePresetOpSchema,
  AddStaggerOpSchema,
  SetParamOpSchema,
  AddAssetOpSchema,
  RemoveAssetOpSchema,
  SetVideoTrackOpSchema,
]);

export type Op =
  | SetCanvasOp
  | AddLayerOp
  | UpdateLayerOp
  | RemoveLayerOp
  | MoveLayerOp
  | SetKeyframesOp
  | AddPresetOp
  | RemovePresetOp
  | AddStaggerOp
  | SetParamOp
  | AddAssetOp
  | RemoveAssetOp
  | SetVideoTrackOp;

export interface ApplyOpsResult {
  doc: MotionDoc;
  revision: number;
  changedIds: string[];
  inversePatches: Patch[];
  warnings: string[];
}

interface LayerLocation {
  layer: Layer;
  container: Layer[];
  index: number;
  parent?: Layer | undefined;
}

function findLayer(
  layers: Layer[],
  id: string,
  parent?: Layer | undefined,
): LayerLocation | null {
  for (let i = 0; i < layers.length; i++) {
    const item = layers[i];
    if (!item) continue;
    if (item.id === id) {
      return { layer: item, container: layers, index: i, parent };
    }
    if (item.type === "group" && item.children) {
      const found = findLayer(item.children, id, item);
      if (found) return found;
    }
  }
  return null;
}

function collectLayerIds(
  layers: Layer[],
  ids = new Set<string>(),
): Set<string> {
  for (const layer of layers) {
    ids.add(layer.id);
    if (layer.type === "group" && layer.children) {
      collectLayerIds(layer.children, ids);
    }
  }
  return ids;
}

function isDescendantOf(
  candidateChildId: string,
  ancestorId: string,
  layers: Layer[],
): boolean {
  const ancestorLoc = findLayer(layers, ancestorId);
  if (
    !ancestorLoc ||
    ancestorLoc.layer.type !== "group" ||
    !ancestorLoc.layer.children
  ) {
    return false;
  }
  return findLayer(ancestorLoc.layer.children, candidateChildId) !== null;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal === undefined) {
      continue;
    }
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      target[key] = sourceVal;
    }
  }
}

/**
 * Applies a batch of operations atomically to a MotionDoc.
 * If any operation fails validation or reference lookup, the entire batch is rejected
 * and an AnimatorError is thrown, leaving the original document unmodified.
 *
 * @param doc - The input MotionDoc.
 * @param ops - An array of Op mutations to apply.
 * @returns ApplyOpsResult with the updated doc, revision, changed IDs, inverse patches, and warnings.
 */
export function applyOps(doc: MotionDoc, ops: Op[]): ApplyOpsResult {
  const warnings: string[] = [];
  const changedIds: string[] = [];

  const [nextDoc, , inversePatches] = produceWithPatches(doc, (draft) => {
    for (let opIndex = 0; opIndex < ops.length; opIndex++) {
      const op = ops[opIndex];
      if (!op) continue;

      switch (op.op) {
        case "setCanvas": {
          if (op.set.width !== undefined && op.set.width <= 0) {
            throw new AnimatorError("Canvas width must be positive", {
              code: "INVALID_CANVAS",
              path: `ops[${opIndex}].set.width`,
              hint: "Width must be a positive integer",
            });
          }
          if (op.set.height !== undefined && op.set.height <= 0) {
            throw new AnimatorError("Canvas height must be positive", {
              code: "INVALID_CANVAS",
              path: `ops[${opIndex}].set.height`,
              hint: "Height must be a positive integer",
            });
          }
          if (op.set.fps !== undefined && op.set.fps <= 0) {
            throw new AnimatorError("Canvas fps must be positive", {
              code: "INVALID_CANVAS",
              path: `ops[${opIndex}].set.fps`,
              hint: "FPS must be a positive number",
            });
          }
          if (op.set.duration !== undefined && op.set.duration <= 0) {
            throw new AnimatorError("Canvas duration must be positive", {
              code: "INVALID_CANVAS",
              path: `ops[${opIndex}].set.duration`,
              hint: "Duration must be a positive number in seconds",
            });
          }
          Object.assign(draft.canvas, op.set);
          break;
        }

        case "addLayer": {
          const existingIds = collectLayerIds(draft.layers);
          const newIds = collectLayerIds([op.layer]);
          for (const newId of newIds) {
            if (existingIds.has(newId)) {
              throw new AnimatorError(`Layer ID '${newId}' already exists`, {
                code: "DUPLICATE_ID",
                path: `ops[${opIndex}].layer.id`,
                hint: "Ensure layer IDs are unique across the document",
              });
            }
          }

          if (op.parent) {
            const parentLoc = findLayer(draft.layers, op.parent);
            if (!parentLoc) {
              throw new AnimatorError(`Parent layer '${op.parent}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: `ops[${opIndex}].parent`,
                hint: "Ensure the parent group layer exists before adding children",
              });
            }
            if (parentLoc.layer.type !== "group") {
              throw new AnimatorError(
                `Parent layer '${op.parent}' is not a group`,
                {
                  code: "INVALID_PARENT",
                  path: `ops[${opIndex}].parent`,
                  hint: "Children can only be added to group layers",
                },
              );
            }
            parentLoc.layer.children = parentLoc.layer.children ?? [];
            const destIndex =
              op.index !== undefined
                ? Math.max(
                    0,
                    Math.min(op.index, parentLoc.layer.children.length),
                  )
                : parentLoc.layer.children.length;
            op.layer.parent = op.parent;
            parentLoc.layer.children.splice(destIndex, 0, op.layer);
          } else {
            const destIndex =
              op.index !== undefined
                ? Math.max(0, Math.min(op.index, draft.layers.length))
                : draft.layers.length;
            draft.layers.splice(destIndex, 0, op.layer);
          }
          changedIds.push(op.layer.id);
          break;
        }

        case "updateLayer": {
          const loc = findLayer(draft.layers, op.id);
          if (!loc) {
            throw new AnimatorError(`Layer '${op.id}' not found`, {
              code: "LAYER_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the layer exists before updating",
            });
          }

          const setObj = op.set as Record<string, unknown>;
          if (typeof setObj.id === "string" && setObj.id !== op.id) {
            const existingIds = collectLayerIds(draft.layers);
            if (existingIds.has(setObj.id)) {
              throw new AnimatorError(
                `Target layer ID '${setObj.id}' already exists`,
                {
                  code: "DUPLICATE_ID",
                  path: `ops[${opIndex}].set.id`,
                  hint: "Layer IDs must remain unique",
                },
              );
            }
            changedIds.push(setObj.id);
          }

          deepMerge(loc.layer as unknown as Record<string, unknown>, setObj);
          changedIds.push(op.id);
          break;
        }

        case "removeLayer": {
          const loc = findLayer(draft.layers, op.id);
          if (!loc) {
            throw new AnimatorError(`Layer '${op.id}' not found`, {
              code: "LAYER_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the layer exists before removing",
            });
          }
          loc.container.splice(loc.index, 1);
          changedIds.push(op.id);
          break;
        }

        case "moveLayer": {
          const loc = findLayer(draft.layers, op.id);
          if (!loc) {
            throw new AnimatorError(`Layer '${op.id}' not found`, {
              code: "LAYER_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the layer exists before moving",
            });
          }

          if (op.parent) {
            if (op.parent === op.id) {
              throw new AnimatorError(
                `Cannot move layer '${op.id}' to itself`,
                {
                  code: "CIRCULAR_REFERENCE",
                  path: `ops[${opIndex}].parent`,
                  hint: "A layer cannot be its own parent",
                },
              );
            }
            const parentLoc = findLayer(draft.layers, op.parent);
            if (!parentLoc) {
              throw new AnimatorError(`Parent layer '${op.parent}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: `ops[${opIndex}].parent`,
                hint: "Ensure the destination parent layer exists",
              });
            }
            if (parentLoc.layer.type !== "group") {
              throw new AnimatorError(
                `Parent layer '${op.parent}' is not a group`,
                {
                  code: "INVALID_PARENT",
                  path: `ops[${opIndex}].parent`,
                  hint: "Only group layers can contain child layers",
                },
              );
            }
            if (isDescendantOf(op.parent, op.id, draft.layers)) {
              throw new AnimatorError(
                `Cannot move layer '${op.id}' into its own descendant '${op.parent}'`,
                {
                  code: "CIRCULAR_REFERENCE",
                  path: `ops[${opIndex}].parent`,
                  hint: "Moving a layer into its descendant creates an illegal hierarchy cycle",
                },
              );
            }

            const [removed] = loc.container.splice(loc.index, 1);
            if (removed) {
              removed.parent = op.parent;
              parentLoc.layer.children = parentLoc.layer.children ?? [];
              const destIndex = Math.max(
                0,
                Math.min(op.index, parentLoc.layer.children.length),
              );
              parentLoc.layer.children.splice(destIndex, 0, removed);
            }
          } else {
            const [removed] = loc.container.splice(loc.index, 1);
            if (removed) {
              removed.parent = undefined;
              const destIndex = Math.max(
                0,
                Math.min(op.index, draft.layers.length),
              );
              draft.layers.splice(destIndex, 0, removed);
            }
          }
          changedIds.push(op.id);
          break;
        }

        case "setKeyframes": {
          const loc = findLayer(draft.layers, op.id);
          if (!loc) {
            throw new AnimatorError(`Layer '${op.id}' not found`, {
              code: "LAYER_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the layer exists before setting keyframes",
            });
          }

          if (op.keyframes === null) {
            if (loc.layer.keyframes) {
              delete loc.layer.keyframes[op.prop];
            }
          } else {
            const fps = draft.canvas.fps;
            const frameMap = new Set<number>();
            for (const kf of op.keyframes) {
              const frame = Math.round(kf.t * fps);
              if (frameMap.has(frame)) {
                throw new AnimatorError(
                  `Duplicate keyframe on frame ${frame} (t=${kf.t}s at ${fps} fps) for prop '${op.prop}'`,
                  {
                    code: "DUPLICATE_KEYFRAME_FRAME",
                    path: `ops[${opIndex}].keyframes`,
                    hint: "Each keyframe for a prop must resolve to a distinct frame",
                  },
                );
              }
              frameMap.add(frame);
            }

            const sorted = [...op.keyframes].sort((a, b) => a.t - b.t);
            loc.layer.keyframes = loc.layer.keyframes ?? {};
            loc.layer.keyframes[op.prop] = sorted;
          }
          changedIds.push(op.id);
          break;
        }

        case "addPreset": {
          const loc = findLayer(draft.layers, op.id);
          if (!loc) {
            throw new AnimatorError(`Layer '${op.id}' not found`, {
              code: "LAYER_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the layer exists before adding a preset",
            });
          }
          loc.layer.presets = loc.layer.presets ?? [];
          loc.layer.presets.push(op.preset);
          changedIds.push(op.id);
          break;
        }

        case "removePreset": {
          const loc = findLayer(draft.layers, op.id);
          if (!loc) {
            throw new AnimatorError(`Layer '${op.id}' not found`, {
              code: "LAYER_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the layer exists before removing a preset",
            });
          }
          if (
            !loc.layer.presets ||
            op.index < 0 ||
            op.index >= loc.layer.presets.length
          ) {
            throw new AnimatorError(`Preset index ${op.index} out of bounds`, {
              code: "INDEX_OUT_OF_BOUNDS",
              path: `ops[${opIndex}].index`,
              hint: `Index must be between 0 and ${(loc.layer.presets?.length ?? 0) - 1}`,
            });
          }
          loc.layer.presets.splice(op.index, 1);
          changedIds.push(op.id);
          break;
        }

        case "addStagger": {
          for (const targetId of op.stagger.targets) {
            const loc = findLayer(draft.layers, targetId);
            if (!loc) {
              warnings.push(
                `Stagger target '${targetId}' was not found in document layers.`,
              );
            }
          }
          draft.staggers = draft.staggers ?? [];
          draft.staggers.push(op.stagger);
          changedIds.push(...op.stagger.targets);
          break;
        }

        case "setParam": {
          draft.params = draft.params ?? {};
          if (op.param === null) {
            delete draft.params[op.name];
          } else {
            draft.params[op.name] = op.param;
          }
          break;
        }

        case "addAsset": {
          draft.assets = draft.assets ?? [];
          if (draft.assets.some((a) => a.id === op.asset.id)) {
            throw new AnimatorError(
              `Asset ID '${op.asset.id}' already exists`,
              {
                code: "DUPLICATE_ID",
                path: `ops[${opIndex}].asset.id`,
                hint: "Ensure asset IDs are unique across the document",
              },
            );
          }
          draft.assets.push(op.asset);
          changedIds.push(op.asset.id);
          break;
        }

        case "removeAsset": {
          draft.assets = draft.assets ?? [];
          const assetIndex = draft.assets.findIndex((a) => a.id === op.id);
          if (assetIndex === -1) {
            throw new AnimatorError(`Asset '${op.id}' not found`, {
              code: "ASSET_NOT_FOUND",
              path: `ops[${opIndex}].id`,
              hint: "Check that the asset ID exists before removing",
            });
          }
          draft.assets.splice(assetIndex, 1);
          changedIds.push(op.id);
          break;
        }

        case "setVideoTrack": {
          const clipIds = new Set<string>();
          for (const clip of op.clips) {
            if (clipIds.has(clip.id)) {
              throw new AnimatorError(
                `Duplicate clip ID '${clip.id}' in video track`,
                {
                  code: "DUPLICATE_ID",
                  path: `ops[${opIndex}].clips`,
                  hint: "Each video clip must have a unique ID",
                },
              );
            }
            clipIds.add(clip.id);
          }
          draft.videoTrack = op.clips;
          changedIds.push(...op.clips.map((c) => c.id));
          break;
        }
      }
    }

    const nextRev = (draft.revision ?? 0) + 1;
    draft.revision = nextRev;
  });

  const nextRev = nextDoc.revision ?? 1;

  return {
    doc: nextDoc,
    revision: nextRev,
    changedIds: Array.from(new Set(changedIds)),
    inversePatches,
    warnings,
  };
}
