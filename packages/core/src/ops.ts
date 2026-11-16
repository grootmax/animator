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
  validateHierarchy,
} from "./schema.js";

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

export type DeepPartial<T> = T extends unknown
  ? T extends (infer _U)[]
    ? T
    : T extends readonly (infer _U)[]
      ? T
      : T extends object
        ? { [P in keyof T]?: DeepPartial<T[P]> }
        : T
  : never;

export type Op =
  | { op: "setCanvas"; set: Partial<Canvas> }
  | { op: "addLayer"; layer: Layer; parent?: string; index?: number }
  | {
      op: "updateLayer";
      id: string;
      set: DeepPartial<Layer> | Record<string, unknown>;
    }
  | { op: "removeLayer"; id: string }
  | { op: "moveLayer"; id: string; parent?: string | null; index: number }
  | {
      op: "setKeyframes";
      id: string;
      prop: AnimProp;
      keyframes: Keyframe[] | null;
    }
  | { op: "addPreset"; id: string; preset: PresetRef }
  | { op: "removePreset"; id: string; index: number }
  | { op: "addStagger"; stagger: Stagger }
  | { op: "setParam"; name: string; param: Param | null }
  | { op: "addAsset"; asset: Asset }
  | { op: "removeAsset"; id: string }
  | { op: "setVideoTrack"; clips: VideoClip[] };

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setCanvas"), set: CanvasSchema.partial() }),
  z.object({
    op: z.literal("addLayer"),
    layer: LayerSchema,
    parent: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal("updateLayer"),
    id: z.string().min(1),
    set: z.record(z.string(), z.unknown()),
  }),
  z.object({ op: z.literal("removeLayer"), id: z.string().min(1) }),
  z.object({
    op: z.literal("moveLayer"),
    id: z.string().min(1),
    parent: z.string().nullable().optional(),
    index: z.number().int(),
  }),
  z.object({
    op: z.literal("setKeyframes"),
    id: z.string().min(1),
    prop: z.string().min(1),
    keyframes: z.array(KeyframeSchema).nullable(),
  }),
  z.object({
    op: z.literal("addPreset"),
    id: z.string().min(1),
    preset: PresetRefSchema,
  }),
  z.object({
    op: z.literal("removePreset"),
    id: z.string().min(1),
    index: z.number().int().nonnegative(),
  }),
  z.object({ op: z.literal("addStagger"), stagger: StaggerSchema }),
  z.object({
    op: z.literal("setParam"),
    name: z.string().min(1),
    param: ParamSchema.nullable(),
  }),
  z.object({ op: z.literal("addAsset"), asset: AssetSchema }),
  z.object({ op: z.literal("removeAsset"), id: z.string().min(1) }),
  z.object({ op: z.literal("setVideoTrack"), clips: z.array(VideoClipSchema) }),
]);

export interface ApplyOpsOptions {
  baseRevision?: number;
}

export interface ApplyOpsResult {
  doc: MotionDoc;
  revision: number;
  changedIds: string[];
  patches: Patch[];
  inversePatches: Patch[];
  warnings: string[];
}

interface LayerLocation {
  layer: Layer;
  container: Layer[];
  index: number;
}

function findLayerLocation(layers: Layer[], id: string): LayerLocation | null {
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l) continue;
    if (l.id === id) {
      return { layer: l, container: layers, index: i };
    }
    if (l.type === "group" && l.children) {
      const found = findLayerLocation(l.children, id);
      if (found) return found;
    }
  }
  return null;
}

function isDescendant(layer: Layer, targetId: string): boolean {
  if (layer.id === targetId) return true;
  if (layer.type === "group" && layer.children) {
    for (const child of layer.children) {
      if (isDescendant(child, targetId)) return true;
    }
  }
  return false;
}

function isPlainObject(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (srcVal === undefined) {
      delete target[key];
    } else if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      deepMerge(tgtVal, srcVal);
    } else {
      target[key] = srcVal;
    }
  }
}

function cleanupParentReferences(layers: Layer[], removedId: string): void {
  for (const layer of layers) {
    if (layer.parent === removedId) {
      layer.parent = undefined;
    }
    if (layer.type === "group" && layer.children) {
      cleanupParentReferences(layer.children, removedId);
    }
  }
}

/**
 * Applies an atomic batch of mutation operations to a MotionDoc using Immer produceWithPatches.
 * If any operation fails validation, the entire batch is aborted and an AnimatorError is thrown.
 *
 * @param doc - The input MotionDoc.
 * @param ops - An array of mutation operations.
 * @param options - Optional baseRevision.
 * @returns An ApplyOpsResult with updated doc, new revision, changedIds, patches, inversePatches, and warnings.
 */
export function applyOps(
  doc: MotionDoc,
  ops: readonly Op[],
  options?: ApplyOpsOptions,
): ApplyOpsResult {
  const changedIdsSet = new Set<string>();
  const warnings: string[] = [];

  const [nextDoc, patches, inversePatches] = produceWithPatches(
    doc,
    (draft) => {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (!op) continue;
        const opPath = `ops[${i}]`;

        switch (op.op) {
          case "setCanvas": {
            const updatedCanvas = { ...draft.canvas, ...op.set };
            const canvasResult = CanvasSchema.safeParse(updatedCanvas);
            if (!canvasResult.success) {
              throw AnimatorError.fromZodError(canvasResult.error);
            }
            draft.canvas = canvasResult.data;
            changedIdsSet.add("canvas");
            break;
          }

          case "addLayer": {
            const parsedLayer = LayerSchema.safeParse(op.layer);
            if (!parsedLayer.success) {
              throw AnimatorError.fromZodError(parsedLayer.error);
            }
            const layerToAdd = parsedLayer.data;

            // Check for duplicate layer ID
            const existing = findLayerLocation(draft.layers, layerToAdd.id);
            if (existing) {
              throw new AnimatorError(
                `Layer ID "${layerToAdd.id}" already exists`,
                {
                  code: "ERR_DUPLICATE_LAYER_ID",
                  path: `${opPath}.layer.id`,
                  hint: "Choose a unique layer ID or update the existing layer with updateLayer.",
                },
              );
            }

            if (op.parent) {
              if (op.parent === layerToAdd.id) {
                throw new AnimatorError(
                  `Layer "${layerToAdd.id}" cannot specify itself as parent`,
                  {
                    code: "ERR_SELF_REFERENCE",
                    path: `${opPath}.parent`,
                    hint: "Remove or change the parent property.",
                  },
                );
              }

              const parentLoc = findLayerLocation(draft.layers, op.parent);
              if (!parentLoc) {
                throw new AnimatorError(
                  `Parent layer "${op.parent}" not found`,
                  {
                    code: "ERR_LAYER_NOT_FOUND",
                    path: `${opPath}.parent`,
                    hint: "Ensure the parent layer exists before adding children.",
                  },
                );
              }

              if (parentLoc.layer.type === "group") {
                const children = parentLoc.layer.children;
                const insertIdx =
                  op.index !== undefined
                    ? Math.max(0, Math.min(op.index, children.length))
                    : children.length;
                children.splice(insertIdx, 0, layerToAdd);
              } else {
                layerToAdd.parent = op.parent;
                const insertIdx =
                  op.index !== undefined
                    ? Math.max(0, Math.min(op.index, draft.layers.length))
                    : draft.layers.length;
                draft.layers.splice(insertIdx, 0, layerToAdd);
              }
            } else {
              const insertIdx =
                op.index !== undefined
                  ? Math.max(0, Math.min(op.index, draft.layers.length))
                  : draft.layers.length;
              draft.layers.splice(insertIdx, 0, layerToAdd);
            }

            changedIdsSet.add(layerToAdd.id);
            validateHierarchy(draft.layers);
            break;
          }

          case "updateLayer": {
            const loc = findLayerLocation(draft.layers, op.id);
            if (!loc) {
              throw new AnimatorError(`Layer with ID "${op.id}" not found`, {
                code: "ERR_LAYER_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Check that layer ID "${op.id}" exists in the document.`,
              });
            }

            const parentVal = (op.set as Record<string, unknown>).parent;
            if (parentVal !== undefined) {
              if (parentVal === op.id) {
                throw new AnimatorError(
                  `Layer "${op.id}" cannot be its own parent`,
                  {
                    code: "ERR_SELF_REFERENCE",
                    path: `${opPath}.set.parent`,
                    hint: "Remove self-referential parent assignment.",
                  },
                );
              }
              if (typeof parentVal === "string") {
                const targetParentLoc = findLayerLocation(
                  draft.layers,
                  parentVal,
                );
                if (!targetParentLoc) {
                  throw new AnimatorError(
                    `Parent layer "${parentVal}" not found`,
                    {
                      code: "ERR_LAYER_NOT_FOUND",
                      path: `${opPath}.set.parent`,
                      hint: "Ensure the specified parent layer exists.",
                    },
                  );
                }
                if (isDescendant(loc.layer, parentVal)) {
                  throw new AnimatorError(
                    `Hierarchy cycle: cannot set parent of "${op.id}" to its own descendant "${parentVal}"`,
                    {
                      code: "ERR_HIERARCHY_CYCLE",
                      path: `${opPath}.set.parent`,
                      hint: `Choose a parent that is not a descendant of layer "${op.id}".`,
                    },
                  );
                }
              }
            }

            deepMerge(
              loc.layer as unknown as Record<string, unknown>,
              op.set as Record<string, unknown>,
            );

            const validatedLayer = LayerSchema.safeParse(loc.layer);
            if (!validatedLayer.success) {
              throw AnimatorError.fromZodError(validatedLayer.error);
            }

            validateHierarchy(draft.layers);
            changedIdsSet.add(op.id);
            break;
          }

          case "removeLayer": {
            const loc = findLayerLocation(draft.layers, op.id);
            if (!loc) {
              throw new AnimatorError(`Layer with ID "${op.id}" not found`, {
                code: "ERR_LAYER_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Check that layer ID "${op.id}" exists.`,
              });
            }

            loc.container.splice(loc.index, 1);
            cleanupParentReferences(draft.layers, op.id);

            if (draft.staggers) {
              for (const stagger of draft.staggers) {
                stagger.targets = stagger.targets.filter((t) => t !== op.id);
              }
            }

            changedIdsSet.add(op.id);
            break;
          }

          case "moveLayer": {
            const loc = findLayerLocation(draft.layers, op.id);
            if (!loc) {
              throw new AnimatorError(`Layer with ID "${op.id}" not found`, {
                code: "ERR_LAYER_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Check that layer ID "${op.id}" exists.`,
              });
            }

            if (op.parent === op.id) {
              throw new AnimatorError(
                `Layer "${op.id}" cannot be its own parent`,
                {
                  code: "ERR_SELF_REFERENCE",
                  path: `${opPath}.parent`,
                  hint: "Remove self-referential parent assignment.",
                },
              );
            }

            if (op.parent && isDescendant(loc.layer, op.parent)) {
              throw new AnimatorError(
                `Hierarchy cycle: cannot move layer "${op.id}" into its descendant "${op.parent}"`,
                {
                  code: "ERR_HIERARCHY_CYCLE",
                  path: `${opPath}.parent`,
                  hint: `Choose a target parent that is not a descendant of layer "${op.id}".`,
                },
              );
            }

            // Remove layer from current location
            loc.container.splice(loc.index, 1);
            const movingLayer = loc.layer;

            if (op.parent) {
              const parentLoc = findLayerLocation(draft.layers, op.parent);
              if (!parentLoc) {
                throw new AnimatorError(
                  `Target parent layer "${op.parent}" not found`,
                  {
                    code: "ERR_LAYER_NOT_FOUND",
                    path: `${opPath}.parent`,
                    hint: "Ensure target parent exists.",
                  },
                );
              }

              if (parentLoc.layer.type === "group") {
                const children = parentLoc.layer.children;
                const targetIdx = Math.max(
                  0,
                  Math.min(op.index, children.length),
                );
                children.splice(targetIdx, 0, movingLayer);
              } else {
                movingLayer.parent = op.parent;
                const targetIdx = Math.max(
                  0,
                  Math.min(op.index, draft.layers.length),
                );
                draft.layers.splice(targetIdx, 0, movingLayer);
              }
              changedIdsSet.add(op.parent);
            } else {
              movingLayer.parent = undefined;
              const targetIdx = Math.max(
                0,
                Math.min(op.index, draft.layers.length),
              );
              draft.layers.splice(targetIdx, 0, movingLayer);
            }

            validateHierarchy(draft.layers);
            changedIdsSet.add(op.id);
            break;
          }

          case "setKeyframes": {
            const loc = findLayerLocation(draft.layers, op.id);
            if (!loc) {
              throw new AnimatorError(`Layer with ID "${op.id}" not found`, {
                code: "ERR_LAYER_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Check that layer ID "${op.id}" exists.`,
              });
            }

            if (op.keyframes === null) {
              if (loc.layer.keyframes) {
                delete loc.layer.keyframes[op.prop];
              }
            } else {
              const parsed = z.array(KeyframeSchema).safeParse(op.keyframes);
              if (!parsed.success) {
                throw AnimatorError.fromZodError(parsed.error);
              }
              const keyframes = [...parsed.data].sort((a, b) => a.t - b.t);

              // Check for duplicate times
              for (let k = 1; k < keyframes.length; k++) {
                const prev = keyframes[k - 1];
                const curr = keyframes[k];
                if (prev && curr && prev.t === curr.t) {
                  throw new AnimatorError(
                    `Duplicate keyframe time ${curr.t} for property "${op.prop}"`,
                    {
                      code: "ERR_DUPLICATE_KEYFRAME_TIME",
                      path: `${opPath}.keyframes[${k}].t`,
                      hint: `Ensure all keyframes for property "${op.prop}" have distinct time values.`,
                    },
                  );
                }
              }

              if (!loc.layer.keyframes) {
                loc.layer.keyframes = {};
              }
              loc.layer.keyframes[op.prop] = keyframes;
            }

            changedIdsSet.add(op.id);
            break;
          }

          case "addPreset": {
            const loc = findLayerLocation(draft.layers, op.id);
            if (!loc) {
              throw new AnimatorError(`Layer with ID "${op.id}" not found`, {
                code: "ERR_LAYER_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Check that layer ID "${op.id}" exists.`,
              });
            }

            const parsed = PresetRefSchema.safeParse(op.preset);
            if (!parsed.success) {
              throw AnimatorError.fromZodError(parsed.error);
            }

            if (!loc.layer.presets) {
              loc.layer.presets = [];
            }
            loc.layer.presets.push(parsed.data);
            changedIdsSet.add(op.id);
            break;
          }

          case "removePreset": {
            const loc = findLayerLocation(draft.layers, op.id);
            if (!loc) {
              throw new AnimatorError(`Layer with ID "${op.id}" not found`, {
                code: "ERR_LAYER_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Check that layer ID "${op.id}" exists.`,
              });
            }

            if (
              !loc.layer.presets ||
              op.index < 0 ||
              op.index >= loc.layer.presets.length
            ) {
              throw new AnimatorError(
                `Preset index ${op.index} is out of bounds for layer "${op.id}"`,
                {
                  code: "ERR_PRESET_INDEX_OUT_OF_BOUNDS",
                  path: `${opPath}.index`,
                  hint: `Layer "${op.id}" has ${loc.layer.presets?.length ?? 0} presets.`,
                },
              );
            }

            loc.layer.presets.splice(op.index, 1);
            changedIdsSet.add(op.id);
            break;
          }

          case "addStagger": {
            const parsed = StaggerSchema.safeParse(op.stagger);
            if (!parsed.success) {
              throw AnimatorError.fromZodError(parsed.error);
            }
            if (!draft.staggers) {
              draft.staggers = [];
            }
            draft.staggers.push(parsed.data);
            for (const target of parsed.data.targets) {
              changedIdsSet.add(target);
            }
            break;
          }

          case "setParam": {
            if (!draft.params) {
              draft.params = {};
            }
            if (op.param === null) {
              delete draft.params[op.name];
            } else {
              const parsed = ParamSchema.safeParse(op.param);
              if (!parsed.success) {
                throw AnimatorError.fromZodError(parsed.error);
              }
              draft.params[op.name] = parsed.data;
            }
            changedIdsSet.add(op.name);
            break;
          }

          case "addAsset": {
            const parsed = AssetSchema.safeParse(op.asset);
            if (!parsed.success) {
              throw AnimatorError.fromZodError(parsed.error);
            }
            if (!draft.assets) {
              draft.assets = [];
            }
            const existingIdx = draft.assets.findIndex(
              (a) => a.id === parsed.data.id,
            );
            if (existingIdx >= 0) {
              draft.assets[existingIdx] = parsed.data;
            } else {
              draft.assets.push(parsed.data);
            }
            changedIdsSet.add(parsed.data.id);
            break;
          }

          case "removeAsset": {
            if (!draft.assets) {
              throw new AnimatorError(`Asset with ID "${op.id}" not found`, {
                code: "ERR_ASSET_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Asset "${op.id}" does not exist in the document.`,
              });
            }
            const idx = draft.assets.findIndex((a) => a.id === op.id);
            if (idx < 0) {
              throw new AnimatorError(`Asset with ID "${op.id}" not found`, {
                code: "ERR_ASSET_NOT_FOUND",
                path: `${opPath}.id`,
                hint: `Asset "${op.id}" does not exist in the document.`,
              });
            }
            draft.assets.splice(idx, 1);
            changedIdsSet.add(op.id);
            break;
          }

          case "setVideoTrack": {
            const parsed = z.array(VideoClipSchema).safeParse(op.clips);
            if (!parsed.success) {
              throw AnimatorError.fromZodError(parsed.error);
            }
            draft.videoTrack = parsed.data;
            for (const clip of parsed.data) {
              changedIdsSet.add(clip.id);
            }
            if (parsed.data.length > 0) {
              warnings.push(
                "Video tracks are not supported in Lottie export and will be composited separately.",
              );
            }
            break;
          }

          default: {
            const unknownOp = (op as { op?: string }).op;
            throw new AnimatorError(`Unknown operation "${unknownOp}"`, {
              code: "ERR_INVALID_OP",
              path: opPath,
              hint: "Supported operations: setCanvas, addLayer, updateLayer, removeLayer, moveLayer, setKeyframes, addPreset, removePreset, addStagger, setParam, addAsset, removeAsset, setVideoTrack.",
            });
          }
        }
      }

      const currentRev = draft.revision ?? options?.baseRevision ?? 0;
      if (ops.length > 0) {
        draft.revision = currentRev + 1;
      }
    },
  );

  const revision = nextDoc.revision ?? options?.baseRevision ?? 0;

  return {
    doc: nextDoc,
    revision,
    changedIds: Array.from(changedIdsSet),
    patches,
    inversePatches,
    warnings,
  };
}
