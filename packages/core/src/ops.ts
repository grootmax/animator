import {
  AnimatorError,
  type ApplyOpsOptions,
  type ApplyOpsResult,
  type Asset,
  type Canvas,
  type DeepPartial,
  type Keyframe,
  type Layer,
  type MotionDoc,
  type Op,
  type Param,
  type PresetRef,
  type Stagger,
  type VideoClip,
} from "./types.js";

function cloneDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cloneDeep) as unknown as T;
  }
  const copy = {} as Record<string, unknown>;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    copy[key] = cloneDeep((obj as Record<string, unknown>)[key]);
  }
  return copy as T;
}

function isObject(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined) continue;
    if (isObject(val) && isObject(target[key])) {
      deepMerge(target[key] as Record<string, unknown>, val);
    } else {
      target[key] = cloneDeep(val);
    }
  }
}

function extractPartial<T extends Record<string, unknown>>(
  source: T,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key in source) {
      const srcVal = source[key];
      const patchVal = patch[key];
      if (isObject(srcVal) && isObject(patchVal)) {
        result[key] = extractPartial(
          srcVal as Record<string, unknown>,
          patchVal as Record<string, unknown>,
        );
      } else {
        result[key] = cloneDeep(srcVal);
      }
    }
  }
  return result;
}

export function applyOps(
  doc: MotionDoc,
  ops: Op[],
  options: ApplyOpsOptions = {},
): ApplyOpsResult {
  const currentRevision = doc.revision ?? 0;
  if (
    options.baseRevision !== undefined &&
    options.baseRevision !== currentRevision
  ) {
    throw new AnimatorError(
      `Stale base revision: expected ${currentRevision}, got ${options.baseRevision}`,
      {
        code: "STALE_REVISION",
        path: "revision",
        hint: "Rebase ops against the latest doc revision",
      },
    );
  }

  const nextDoc: MotionDoc = cloneDeep(doc);
  const changedIdsSet = new Set<string>();
  const inversePatches: Op[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || typeof op !== "object" || !("op" in op)) {
      throw new AnimatorError(`Invalid operation at index ${i}`, {
        code: "INVALID_OP",
        path: `ops[${i}]`,
        hint: "Operation must be a valid Op object",
      });
    }

    switch (op.op) {
      case "setCanvas": {
        const prevCanvas: Partial<Canvas> = {};
        for (const key of Object.keys(op.set) as (keyof Canvas)[]) {
          if (key in nextDoc.canvas) {
            prevCanvas[key] = nextDoc.canvas[key] as never;
          }
        }
        nextDoc.canvas = { ...nextDoc.canvas, ...op.set };
        inversePatches.unshift({ op: "setCanvas", set: prevCanvas });
        break;
      }

      case "addLayer": {
        if (!op.layer || !op.layer.id) {
          throw new AnimatorError("addLayer op requires a layer with an id", {
            code: "INVALID_LAYER",
            path: `ops[${i}].layer`,
          });
        }
        if (nextDoc.layers.some((l) => l.id === op.layer.id)) {
          throw new AnimatorError(
            `Layer with id '${op.layer.id}' already exists`,
            {
              code: "DUPLICATE_LAYER_ID",
              path: `ops[${i}].layer.id`,
            },
          );
        }

        const layerToAdd: Layer = cloneDeep(op.layer);
        if (op.parent !== undefined) {
          layerToAdd.parent = op.parent;
        }

        const insertIndex =
          op.index !== undefined ? op.index : nextDoc.layers.length;
        if (insertIndex < 0 || insertIndex > nextDoc.layers.length) {
          throw new AnimatorError(
            `Index ${insertIndex} out of bounds for addLayer`,
            {
              code: "OUT_OF_BOUNDS",
              path: `ops[${i}].index`,
            },
          );
        }

        nextDoc.layers.splice(insertIndex, 0, layerToAdd);
        changedIdsSet.add(layerToAdd.id);
        inversePatches.unshift({ op: "removeLayer", id: layerToAdd.id });
        break;
      }

      case "updateLayer": {
        const layerIndex = nextDoc.layers.findIndex((l) => l.id === op.id);
        if (layerIndex === -1) {
          throw new AnimatorError(`Layer '${op.id}' not found`, {
            code: "LAYER_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        const targetLayer = nextDoc.layers[layerIndex] as Layer;
        const prevValues = extractPartial(
          targetLayer as unknown as Record<string, unknown>,
          op.set as unknown as Record<string, unknown>,
        ) as DeepPartial<Layer>;

        deepMerge(
          targetLayer as unknown as Record<string, unknown>,
          op.set as unknown as Record<string, unknown>,
        );

        changedIdsSet.add(op.id);
        inversePatches.unshift({
          op: "updateLayer",
          id: op.id,
          set: prevValues,
        });
        break;
      }

      case "removeLayer": {
        const layerIndex = nextDoc.layers.findIndex((l) => l.id === op.id);
        if (layerIndex === -1) {
          throw new AnimatorError(`Layer '${op.id}' not found`, {
            code: "LAYER_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        const removedLayer = nextDoc.layers[layerIndex] as Layer;
        nextDoc.layers.splice(layerIndex, 1);
        changedIdsSet.add(op.id);

        inversePatches.unshift({
          op: "addLayer",
          layer: cloneDeep(removedLayer),
          index: layerIndex,
        });
        break;
      }

      case "moveLayer": {
        const layerIndex = nextDoc.layers.findIndex((l) => l.id === op.id);
        if (layerIndex === -1) {
          throw new AnimatorError(`Layer '${op.id}' not found`, {
            code: "LAYER_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        const [movedLayer] = nextDoc.layers.splice(layerIndex, 1);
        if (!movedLayer) break;

        const prevParent = movedLayer.parent ?? null;
        if (op.parent !== undefined) {
          movedLayer.parent = op.parent;
        }

        const newIndex = Math.max(0, Math.min(op.index, nextDoc.layers.length));
        nextDoc.layers.splice(newIndex, 0, movedLayer);
        changedIdsSet.add(op.id);

        inversePatches.unshift({
          op: "moveLayer",
          id: op.id,
          parent: prevParent,
          index: layerIndex,
        });
        break;
      }

      case "setKeyframes": {
        const layer = nextDoc.layers.find((l) => l.id === op.id);
        if (!layer) {
          throw new AnimatorError(`Layer '${op.id}' not found`, {
            code: "LAYER_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        if (!layer.keyframes) {
          layer.keyframes = {};
        }

        const existingKeyframes = layer.keyframes[op.prop];
        const prevKeyframes: Keyframe[] | null = existingKeyframes
          ? cloneDeep(existingKeyframes)
          : null;

        if (op.keyframes === null) {
          delete layer.keyframes[op.prop];
        } else {
          layer.keyframes[op.prop] = cloneDeep(op.keyframes);
        }

        changedIdsSet.add(op.id);
        inversePatches.unshift({
          op: "setKeyframes",
          id: op.id,
          prop: op.prop,
          keyframes: prevKeyframes,
        });
        break;
      }

      case "addPreset": {
        const layer = nextDoc.layers.find((l) => l.id === op.id);
        if (!layer) {
          throw new AnimatorError(`Layer '${op.id}' not found`, {
            code: "LAYER_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        if (!layer.presets) {
          layer.presets = [];
        }

        layer.presets.push(cloneDeep(op.preset));
        const presetIndex = layer.presets.length - 1;
        changedIdsSet.add(op.id);

        inversePatches.unshift({
          op: "removePreset",
          id: op.id,
          index: presetIndex,
        });
        break;
      }

      case "removePreset": {
        const layer = nextDoc.layers.find((l) => l.id === op.id);
        if (!layer) {
          throw new AnimatorError(`Layer '${op.id}' not found`, {
            code: "LAYER_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        if (
          !layer.presets ||
          op.index < 0 ||
          op.index >= layer.presets.length
        ) {
          throw new AnimatorError(
            `Preset index ${op.index} out of bounds for layer '${op.id}'`,
            {
              code: "OUT_OF_BOUNDS",
              path: `ops[${i}].index`,
            },
          );
        }

        const [removedPreset] = layer.presets.splice(op.index, 1);
        if (removedPreset) {
          changedIdsSet.add(op.id);
          inversePatches.unshift({
            op: "addPreset",
            id: op.id,
            preset: cloneDeep(removedPreset),
          });
        }
        break;
      }

      case "addStagger": {
        if (!nextDoc.staggers) {
          nextDoc.staggers = [];
        }
        nextDoc.staggers.push(cloneDeep(op.stagger));
        break;
      }

      case "setParam": {
        if (!nextDoc.params) {
          nextDoc.params = {};
        }

        const existingParam = nextDoc.params[op.name];
        const prevParam: Param | null = existingParam
          ? cloneDeep(existingParam)
          : null;

        if (op.param === null) {
          delete nextDoc.params[op.name];
        } else {
          nextDoc.params[op.name] = cloneDeep(op.param);
        }

        inversePatches.unshift({
          op: "setParam",
          name: op.name,
          param: prevParam,
        });
        break;
      }

      case "addAsset": {
        if (!nextDoc.assets) {
          nextDoc.assets = [];
        }

        const existingIndex = nextDoc.assets.findIndex(
          (a) => a.id === op.asset.id,
        );
        if (existingIndex >= 0) {
          const prevAsset = nextDoc.assets[existingIndex] as Asset;
          nextDoc.assets[existingIndex] = cloneDeep(op.asset);
          inversePatches.unshift({
            op: "addAsset",
            asset: cloneDeep(prevAsset),
          });
        } else {
          nextDoc.assets.push(cloneDeep(op.asset));
          inversePatches.unshift({
            op: "removeAsset",
            id: op.asset.id,
          });
        }
        break;
      }

      case "removeAsset": {
        if (!nextDoc.assets) {
          throw new AnimatorError(`Asset '${op.id}' not found`, {
            code: "ASSET_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        const assetIndex = nextDoc.assets.findIndex((a) => a.id === op.id);
        if (assetIndex === -1) {
          throw new AnimatorError(`Asset '${op.id}' not found`, {
            code: "ASSET_NOT_FOUND",
            path: `ops[${i}].id`,
          });
        }

        const [removedAsset] = nextDoc.assets.splice(assetIndex, 1);
        if (removedAsset) {
          inversePatches.unshift({
            op: "addAsset",
            asset: cloneDeep(removedAsset),
          });
        }
        break;
      }

      case "setVideoTrack": {
        const prevTrack = nextDoc.videoTrack
          ? cloneDeep(nextDoc.videoTrack)
          : [];
        nextDoc.videoTrack = cloneDeep(op.clips);
        inversePatches.unshift({
          op: "setVideoTrack",
          clips: prevTrack,
        });
        break;
      }

      default: {
        const unhandled = op as { op: string };
        throw new AnimatorError(`Unknown op type: ${unhandled.op}`, {
          code: "UNKNOWN_OP",
          path: `ops[${i}].op`,
        });
      }
    }
  }

  const nextRevision = currentRevision + 1;
  nextDoc.revision = nextRevision;

  return {
    doc: nextDoc,
    revision: nextRevision,
    changedIds: Array.from(changedIdsSet),
    inversePatches,
    warnings,
  };
}
