import { produce } from "immer";
import type { ApplyOpsResult, Layer, MotionDoc, Op } from "./types.js";

export function applyOps(
  doc: MotionDoc,
  ops: Op[],
  baseRevision = 0,
): ApplyOpsResult {
  const changedIds = new Set<string>();

  const nextDoc = produce(doc, (draft) => {
    for (const op of ops) {
      switch (op.op) {
        case "setCanvas": {
          Object.assign(draft.canvas, op.set);
          break;
        }
        case "addLayer": {
          if (draft.layers.some((l) => l.id === op.layer.id)) {
            throw new Error(`Layer with id '${op.layer.id}' already exists`);
          }
          if (
            op.index !== undefined &&
            op.index >= 0 &&
            op.index <= draft.layers.length
          ) {
            draft.layers.splice(op.index, 0, op.layer as Layer);
          } else {
            draft.layers.push(op.layer as Layer);
          }
          changedIds.add(op.layer.id);
          break;
        }
        case "updateLayer": {
          const layer = draft.layers.find((l) => l.id === op.id);
          if (!layer) {
            throw new Error(`Layer with id '${op.id}' not found`);
          }
          Object.assign(layer, op.set);
          changedIds.add(op.id);
          break;
        }
        case "removeLayer": {
          const index = draft.layers.findIndex((l) => l.id === op.id);
          if (index === -1) {
            throw new Error(`Layer with id '${op.id}' not found`);
          }
          draft.layers.splice(index, 1);
          changedIds.add(op.id);
          break;
        }
        case "moveLayer": {
          const index = draft.layers.findIndex((l) => l.id === op.id);
          if (index === -1) {
            throw new Error(`Layer with id '${op.id}' not found`);
          }
          const [removed] = draft.layers.splice(index, 1);
          if (removed) {
            const targetIndex = Math.max(
              0,
              Math.min(op.index, draft.layers.length),
            );
            draft.layers.splice(targetIndex, 0, removed);
            changedIds.add(op.id);
          }
          break;
        }
        default: {
          const _exhaustiveCheck: never = op;
          throw new Error(`Unknown op type: ${JSON.stringify(op)}`);
        }
      }
    }
  });

  return {
    doc: nextDoc,
    revision: baseRevision + 1,
    changedIds: Array.from(changedIds),
  };
}
