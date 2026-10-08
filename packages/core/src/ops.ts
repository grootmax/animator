import type { ApplyOpsResult, Layer, MotionDoc, Op } from "./types.js";

export function createDefaultDoc(): MotionDoc {
  return {
    version: 1,
    name: "New Animation",
    canvas: {
      width: 1080,
      height: 1080,
      fps: 30,
      duration: 4,
      background: "#0B1020",
    },
    params: {
      accent: { type: "color", value: "#FF5A5F", label: "Accent Color" },
      headline: { type: "text", value: "Ship Faster", label: "Headline Text" },
    },
    layers: [
      {
        id: "rect-1",
        name: "Card Rectangle",
        type: "shape",
        position: [540, 540],
        scale: [100, 100],
        rotation: 0,
        opacity: 100,
        visible: true,
        fill: "{{accent}}",
        stroke: { color: "#FFFFFF", width: 4, cap: "round" },
        shape: { kind: "rect", size: [400, 240], radius: 16 },
      },
      {
        id: "text-1",
        name: "Main Title",
        type: "text",
        position: [540, 540],
        scale: [100, 100],
        rotation: 0,
        opacity: 100,
        visible: true,
        text: "{{headline}}",
        font: { family: "Inter", weight: 700, size: 48 },
        fill: "#FFFFFF",
        align: "center",
      },
    ],
  };
}

function updateLayerDeep(existing: Layer, set: Partial<Layer>): Layer {
  const updated = { ...existing, ...set };
  if (set.stroke && existing.stroke) {
    updated.stroke = { ...existing.stroke, ...set.stroke };
  }
  if (set.shape && existing.shape) {
    updated.shape = { ...existing.shape, ...set.shape };
  }
  if (set.font && existing.font) {
    updated.font = { ...existing.font, ...set.font };
  }
  return updated;
}

function getPreviousLayerState(
  existing: Layer,
  set: Partial<Layer>,
): Partial<Layer> {
  const prev: Partial<Layer> = {};
  for (const key of Object.keys(set) as (keyof Layer)[]) {
    if (key === "stroke" && existing.stroke && set.stroke) {
      prev.stroke = { ...existing.stroke };
    } else if (key === "shape" && existing.shape && set.shape) {
      prev.shape = { ...existing.shape };
    } else if (key === "font" && existing.font && set.font) {
      prev.font = { ...existing.font };
    } else {
      (prev as Record<string, unknown>)[key] = existing[key];
    }
  }
  return prev;
}

export function applyOps(doc: MotionDoc, ops: Op[]): ApplyOpsResult {
  const currentDoc: MotionDoc = JSON.parse(JSON.stringify(doc));
  const inverseOps: Op[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "setCanvas": {
        const prevCanvas: Record<string, unknown> = {};
        for (const k of Object.keys(op.set) as (keyof typeof op.set)[]) {
          prevCanvas[k] = currentDoc.canvas[k];
        }
        currentDoc.canvas = { ...currentDoc.canvas, ...op.set };
        inverseOps.unshift({ op: "setCanvas", set: prevCanvas });
        break;
      }

      case "addLayer": {
        const index =
          op.index !== undefined ? op.index : currentDoc.layers.length;
        currentDoc.layers.splice(index, 0, op.layer);
        inverseOps.unshift({ op: "removeLayer", id: op.layer.id });
        break;
      }

      case "updateLayer": {
        const idx = currentDoc.layers.findIndex((l) => l.id === op.id);
        const existing = currentDoc.layers[idx];
        if (existing) {
          const prevSet = getPreviousLayerState(existing, op.set);
          currentDoc.layers[idx] = updateLayerDeep(existing, op.set);
          inverseOps.unshift({ op: "updateLayer", id: op.id, set: prevSet });
        }
        break;
      }

      case "removeLayer": {
        const idx = currentDoc.layers.findIndex((l) => l.id === op.id);
        const removed = currentDoc.layers[idx];
        if (removed) {
          currentDoc.layers.splice(idx, 1);
          inverseOps.unshift({ op: "addLayer", layer: removed, index: idx });
        }
        break;
      }

      case "moveLayer": {
        const idx = currentDoc.layers.findIndex((l) => l.id === op.id);
        if (idx !== -1 && idx !== op.index) {
          const [layer] = currentDoc.layers.splice(idx, 1);
          if (layer) {
            currentDoc.layers.splice(op.index, 0, layer);
            inverseOps.unshift({ op: "moveLayer", id: op.id, index: idx });
          }
        }
        break;
      }

      case "setParam": {
        const prevParam = currentDoc.params[op.name] ?? null;
        if (op.param === null) {
          delete currentDoc.params[op.name];
        } else {
          currentDoc.params[op.name] = op.param;
        }
        inverseOps.unshift({ op: "setParam", name: op.name, param: prevParam });
        break;
      }
    }
  }

  return {
    doc: currentDoc,
    inverseOps,
  };
}
