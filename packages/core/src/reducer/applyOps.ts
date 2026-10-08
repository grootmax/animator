import {
  type Patch,
  applyPatches,
  enablePatches,
  produceWithPatches,
} from "immer";

enablePatches();
import { AnimatorError } from "../errors.js";
import { type MotionDoc, MotionDocSchema } from "../schemas/document.js";
import type { Layer } from "../schemas/layer.js";
import { type Op, OpSchema } from "../schemas/ops.js";

export interface ApplyOpsResult {
  doc: MotionDoc;
  patches: Patch[];
  inversePatches: Patch[];
  changedIds: string[];
  warnings: string[];
}

export function findLayerAndContainer(
  layers: Layer[],
  id: string,
): { layer: Layer; container: Layer[]; index: number } | null {
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l) continue;
    if (l.id === id) {
      return { layer: l, container: layers, index: i };
    }
    if (l.type === "group" && Array.isArray(l.children)) {
      const found = findLayerAndContainer(l.children, id);
      if (found) return found;
    }
  }
  return null;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined) continue;
    const targetVal = target[key];
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      deepMerge(
        targetVal as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      target[key] = val;
    }
  }
}

export function applyOps(doc: MotionDoc, ops: Op[]): ApplyOpsResult {
  if (!Array.isArray(ops)) {
    throw new AnimatorError("ops must be an array", {
      code: "INVALID_OPS_PAYLOAD",
    });
  }

  // Pre-validate input operations against Zod schemas
  const validatedOps: Op[] = ops.map((op, idx) => {
    const result = OpSchema.safeParse(op);
    if (!result.success) {
      throw new AnimatorError(
        `Invalid operation at index ${idx}: ${result.error.message}`,
        {
          code: "INVALID_OP_SCHEMA",
          path: `ops[${idx}]`,
          hint: "Check operation schema definition",
        },
      );
    }
    return result.data;
  });

  const changedIds = new Set<string>();
  const warnings: string[] = [];

  const [nextDoc, patches, inversePatches] = produceWithPatches(
    doc,
    (draft) => {
      for (const op of validatedOps) {
        switch (op.op) {
          case "setCanvas": {
            Object.assign(draft.canvas, op.set);
            break;
          }

          case "addLayer": {
            const newLayer = op.layer;
            if (findLayerAndContainer(draft.layers, newLayer.id)) {
              throw new AnimatorError(
                `Layer with id '${newLayer.id}' already exists`,
                {
                  code: "DUPLICATE_LAYER_ID",
                  path: "ops.addLayer",
                },
              );
            }
            let targetContainer = draft.layers;
            if (op.parent) {
              const parentFound = findLayerAndContainer(
                draft.layers,
                op.parent,
              );
              if (!parentFound || parentFound.layer.type !== "group") {
                throw new AnimatorError(
                  `Parent group layer '${op.parent}' not found`,
                  {
                    code: "PARENT_NOT_FOUND",
                    path: "ops.addLayer",
                  },
                );
              }
              if (!parentFound.layer.children) {
                parentFound.layer.children = [];
              }
              targetContainer = parentFound.layer.children;
            }

            if (
              op.index !== undefined &&
              op.index >= 0 &&
              op.index <= targetContainer.length
            ) {
              targetContainer.splice(op.index, 0, newLayer);
            } else {
              targetContainer.push(newLayer);
            }
            changedIds.add(newLayer.id);
            break;
          }

          case "updateLayer": {
            const found = findLayerAndContainer(draft.layers, op.id);
            if (!found) {
              throw new AnimatorError(`Layer '${op.id}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: "ops.updateLayer",
              });
            }
            deepMerge(found.layer as Record<string, unknown>, op.set);
            changedIds.add(op.id);
            break;
          }

          case "removeLayer": {
            const found = findLayerAndContainer(draft.layers, op.id);
            if (!found) {
              throw new AnimatorError(`Layer '${op.id}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: "ops.removeLayer",
              });
            }
            found.container.splice(found.index, 1);
            changedIds.add(op.id);
            break;
          }

          case "moveLayer": {
            const found = findLayerAndContainer(draft.layers, op.id);
            if (!found) {
              throw new AnimatorError(`Layer '${op.id}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: "ops.moveLayer",
              });
            }
            // Remove from current position
            const [movedLayer] = found.container.splice(found.index, 1);
            if (!movedLayer) break;

            let targetContainer = draft.layers;
            if (op.parent) {
              const parentFound = findLayerAndContainer(
                draft.layers,
                op.parent,
              );
              if (!parentFound || parentFound.layer.type !== "group") {
                throw new AnimatorError(
                  `Parent group layer '${op.parent}' not found`,
                  {
                    code: "PARENT_NOT_FOUND",
                    path: "ops.moveLayer",
                  },
                );
              }
              if (!parentFound.layer.children) {
                parentFound.layer.children = [];
              }
              targetContainer = parentFound.layer.children;
              movedLayer.parent = op.parent;
            } else {
              movedLayer.parent = undefined;
            }

            const targetIndex = Math.max(
              0,
              Math.min(op.index, targetContainer.length),
            );
            targetContainer.splice(targetIndex, 0, movedLayer);
            changedIds.add(op.id);
            break;
          }

          case "setKeyframes": {
            const found = findLayerAndContainer(draft.layers, op.id);
            if (!found) {
              throw new AnimatorError(`Layer '${op.id}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: "ops.setKeyframes",
              });
            }
            const layerRec = found.layer;
            if (!layerRec.keyframes) {
              layerRec.keyframes = {};
            }
            if (op.keyframes === null) {
              delete layerRec.keyframes[op.prop];
            } else {
              layerRec.keyframes[op.prop] = op.keyframes;
            }
            changedIds.add(op.id);
            break;
          }

          case "addPreset": {
            const found = findLayerAndContainer(draft.layers, op.id);
            if (!found) {
              throw new AnimatorError(`Layer '${op.id}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: "ops.addPreset",
              });
            }
            const layerRec = found.layer;
            if (!layerRec.presets) {
              layerRec.presets = [];
            }
            layerRec.presets.push(op.preset);
            changedIds.add(op.id);
            break;
          }

          case "removePreset": {
            const found = findLayerAndContainer(draft.layers, op.id);
            if (!found) {
              throw new AnimatorError(`Layer '${op.id}' not found`, {
                code: "LAYER_NOT_FOUND",
                path: "ops.removePreset",
              });
            }
            const layerRec = found.layer;
            if (
              layerRec.presets &&
              Array.isArray(layerRec.presets) &&
              op.index >= 0 &&
              op.index < layerRec.presets.length
            ) {
              layerRec.presets.splice(op.index, 1);
            }
            changedIds.add(op.id);
            break;
          }

          case "addStagger": {
            if (!draft.staggers) {
              draft.staggers = [];
            }
            draft.staggers.push(op.stagger);
            changedIds.add(op.stagger.id);
            break;
          }

          case "setParam": {
            if (!draft.params) {
              draft.params = {};
            }
            if (op.param === null) {
              delete draft.params[op.name];
            } else {
              draft.params[op.name] = op.param;
            }
            changedIds.add(op.name);
            break;
          }

          case "addAsset": {
            if (!draft.assets) {
              draft.assets = [];
            }
            draft.assets.push(op.asset);
            changedIds.add(op.asset.id);
            break;
          }

          case "removeAsset": {
            if (draft.assets) {
              draft.assets = draft.assets.filter((a) => a.id !== op.id);
            }
            changedIds.add(op.id);
            break;
          }

          case "setVideoTrack": {
            draft.videoTrack = op.clips;
            break;
          }
        }
      }
    },
  );

  // Validate the resulting document against MotionDocSchema
  const validatedDocResult = MotionDocSchema.safeParse(nextDoc);
  if (!validatedDocResult.success) {
    throw new AnimatorError(
      `Document validation failed after applying ops: ${validatedDocResult.error.message}`,
      {
        code: "INVALID_DOCUMENT_STATE",
        hint: "Operation created an invalid document structure",
      },
    );
  }

  return {
    doc: validatedDocResult.data,
    patches,
    inversePatches,
    changedIds: Array.from(changedIds),
    warnings,
  };
}

export { applyPatches };
