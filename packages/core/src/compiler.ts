import type { MotionDoc } from "./types.js";

function hexToRgba(hex?: string): [number, number, number, number] {
  if (!hex || !hex.startsWith("#")) return [1, 1, 1, 1];
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 6) {
    const r = Number.parseInt(h.slice(0, 2), 16) / 255;
    const g = Number.parseInt(h.slice(2, 4), 16) / 255;
    const b = Number.parseInt(h.slice(4, 6), 16) / 255;
    return [
      Math.round(r * 1000) / 1000,
      Math.round(g * 1000) / 1000,
      Math.round(b * 1000) / 1000,
      1,
    ];
  }
  return [1, 1, 1, 1];
}

export function compileToLottie(doc: MotionDoc): Record<string, unknown> {
  const totalFrames = Math.max(
    1,
    Math.round(doc.canvas.duration * doc.canvas.fps),
  );
  const lottieLayers: Record<string, unknown>[] = [];

  // Lottie is top-first; MotionDoc is bottom-first painter's order
  const reversedLayers = [...doc.layers].reverse();

  reversedLayers.forEach((layer, idx) => {
    const pos = layer.position ?? [doc.canvas.width / 2, doc.canvas.height / 2];
    const size = layer.size ?? [100, 100];
    const opacity = layer.opacity ?? 100;
    const items: Record<string, unknown>[] = [];

    // Shape item
    if (
      layer.shape?.kind === "ellipse" ||
      (!layer.shape && layer.type === "shape")
    ) {
      const s = layer.shape?.size ?? size;
      items.push({
        ty: "el",
        nm: "Ellipse",
        p: { a: 0, k: [0, 0] },
        s: { a: 0, k: [s[0] ?? 100, s[1] ?? 100] },
      });
    } else if (layer.shape?.kind === "rect") {
      const s = layer.shape.size ?? size;
      items.push({
        ty: "rc",
        nm: "Rectangle",
        p: { a: 0, k: [0, 0] },
        s: { a: 0, k: [s[0] ?? 100, s[1] ?? 100] },
        r: { a: 0, k: layer.shape.radius ?? 0 },
      });
    } else {
      items.push({
        ty: "rc",
        nm: "Rectangle",
        p: { a: 0, k: [0, 0] },
        s: { a: 0, k: [size[0] ?? 100, size[1] ?? 100] },
        r: { a: 0, k: 0 },
      });
    }

    // Fill
    if (layer.fill) {
      items.push({
        ty: "fl",
        nm: "Fill",
        c: { a: 0, k: hexToRgba(layer.fill) },
        o: { a: 0, k: 100 },
      });
    }

    // Stroke
    if (layer.stroke) {
      items.push({
        ty: "st",
        nm: "Stroke",
        c: { a: 0, k: hexToRgba(layer.stroke.color) },
        o: { a: 0, k: 100 },
        w: { a: 0, k: layer.stroke.width },
      });
    }

    // Transform is ALWAYS last in shape group (Lottie rule)
    items.push({
      ty: "tr",
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
      r: { a: 0, k: 0 },
      o: { a: 0, k: 100 },
    });

    lottieLayers.push({
      ddd: 0,
      ind: idx + 1,
      ty: 4, // shape layer
      nm: layer.name ?? layer.id,
      sr: 1,
      ks: {
        o: { a: 0, k: opacity },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [pos[0] ?? 0, pos[1] ?? 0, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ip: 0,
      op: totalFrames,
      st: 0,
      bm: 0,
      shapes: [
        {
          ty: "gr",
          nm: "Group",
          it: items,
        },
      ],
    });
  });

  return {
    v: "5.7.0",
    fr: doc.canvas.fps,
    ip: 0,
    op: totalFrames,
    w: doc.canvas.width,
    h: doc.canvas.height,
    nm: doc.name,
    ddd: 0,
    assets: [],
    layers: lottieLayers,
  };
}

export function createDefaultMotionDoc(): MotionDoc {
  return {
    version: 1,
    name: "Editor Demo",
    canvas: {
      width: 600,
      height: 400,
      fps: 30,
      duration: 3,
      background: "#0B1020",
    },
    layers: [
      {
        id: "hero-circle",
        name: "Hero Circle",
        type: "shape",
        position: [300, 180],
        size: [120, 120],
        fill: "#FF5A5F",
        shape: {
          kind: "ellipse",
          size: [120, 120],
        },
      },
      {
        id: "badge-pill",
        name: "Badge Pill",
        type: "shape",
        position: [300, 300],
        size: [180, 48],
        fill: "#00E676",
        shape: {
          kind: "rect",
          size: [180, 48],
          radius: 24,
        },
      },
    ],
  };
}
