import type { ApplyOpsResult, Canvas, Layer, MotionDoc, Op } from "./types.js";

export function createDefaultDoc(
  name = "Untitled",
  width = 1080,
  height = 1080,
  fps = 30,
  duration = 4,
  background = "#0B1020",
): MotionDoc {
  return {
    version: 1,
    revision: 0,
    name,
    canvas: {
      width,
      height,
      fps,
      duration,
      background,
    },
    params: {},
    assets: [],
    layers: [],
    videoTrack: [],
  };
}

export function applyOps(doc: MotionDoc, ops: Op[]): ApplyOpsResult {
  const updated: MotionDoc = JSON.parse(JSON.stringify(doc));
  const changedIdsSet = new Set<string>();
  const warnings: string[] = [];

  for (const item of ops) {
    switch (item.op) {
      case "setCanvas": {
        updated.canvas = { ...updated.canvas, ...item.set };
        break;
      }
      case "addLayer": {
        const layer = item.layer;
        if (updated.layers.some((l) => l.id === layer.id)) {
          warnings.push(
            `Layer with id '${layer.id}' already exists, skipping addLayer.`,
          );
          break;
        }
        if (item.parent) {
          layer.parent = item.parent;
        }
        if (
          typeof item.index === "number" &&
          item.index >= 0 &&
          item.index <= updated.layers.length
        ) {
          updated.layers.splice(item.index, 0, layer);
        } else {
          updated.layers.push(layer);
        }
        changedIdsSet.add(layer.id);
        break;
      }
      case "updateLayer": {
        const idx = updated.layers.findIndex((l) => l.id === item.id);
        if (idx === -1) {
          warnings.push(`Layer '${item.id}' not found for updateLayer.`);
          break;
        }
        const existing = updated.layers[idx];
        if (existing) {
          updated.layers[idx] = { ...existing, ...item.set };
          changedIdsSet.add(item.id);
        }
        break;
      }
      case "removeLayer": {
        const idx = updated.layers.findIndex((l) => l.id === item.id);
        if (idx === -1) {
          warnings.push(`Layer '${item.id}' not found for removeLayer.`);
          break;
        }
        updated.layers.splice(idx, 1);
        changedIdsSet.add(item.id);
        break;
      }
      case "moveLayer": {
        const idx = updated.layers.findIndex((l) => l.id === item.id);
        if (idx === -1) {
          warnings.push(`Layer '${item.id}' not found for moveLayer.`);
          break;
        }
        const [removed] = updated.layers.splice(idx, 1);
        if (removed) {
          if (item.parent !== undefined) {
            removed.parent = item.parent;
          }
          const targetIndex = Math.min(
            Math.max(0, item.index),
            updated.layers.length,
          );
          updated.layers.splice(targetIndex, 0, removed);
          changedIdsSet.add(item.id);
        }
        break;
      }
      case "setKeyframes": {
        const layer = updated.layers.find((l) => l.id === item.id);
        if (!layer) {
          warnings.push(`Layer '${item.id}' not found for setKeyframes.`);
          break;
        }
        layer.keyframes = layer.keyframes || {};
        if (item.keyframes === null) {
          delete layer.keyframes[item.prop];
        } else {
          layer.keyframes[item.prop] = item.keyframes;
        }
        changedIdsSet.add(item.id);
        break;
      }
      case "addPreset": {
        const layer = updated.layers.find((l) => l.id === item.id);
        if (!layer) {
          warnings.push(`Layer '${item.id}' not found for addPreset.`);
          break;
        }
        layer.presets = layer.presets || [];
        layer.presets.push(item.preset);
        changedIdsSet.add(item.id);
        break;
      }
      case "removePreset": {
        const layer = updated.layers.find((l) => l.id === item.id);
        if (!layer || !layer.presets) {
          warnings.push(
            `Layer '${item.id}' or its presets not found for removePreset.`,
          );
          break;
        }
        if (item.index >= 0 && item.index < layer.presets.length) {
          layer.presets.splice(item.index, 1);
          changedIdsSet.add(item.id);
        } else {
          warnings.push(
            `Preset index ${item.index} out of bounds on layer '${item.id}'.`,
          );
        }
        break;
      }
      case "setParam": {
        updated.params = updated.params || {};
        if (item.param === null) {
          delete updated.params[item.name];
        } else {
          updated.params[item.name] = item.param;
        }
        break;
      }
      case "addAsset": {
        updated.assets = updated.assets || [];
        if (updated.assets.some((a) => a.id === item.asset.id)) {
          warnings.push(`Asset '${item.asset.id}' already exists.`);
          break;
        }
        updated.assets.push(item.asset);
        break;
      }
      case "removeAsset": {
        if (!updated.assets) break;
        const idx = updated.assets.findIndex((a) => a.id === item.id);
        if (idx !== -1) {
          updated.assets.splice(idx, 1);
        } else {
          warnings.push(`Asset '${item.id}' not found for removeAsset.`);
        }
        break;
      }
      case "setVideoTrack": {
        updated.videoTrack = item.clips;
        break;
      }
      default: {
        const unknownOp = (item as { op: string }).op;
        warnings.push(`Unknown op type '${unknownOp}'.`);
      }
    }
  }

  updated.revision = (updated.revision || 0) + 1;

  return {
    doc: updated,
    revision: updated.revision,
    changedIds: Array.from(changedIdsSet),
    warnings,
  };
}
