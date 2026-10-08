import { getBezierEasingHandles } from "./easing.js";
import { AnimatorError } from "./errors.js";
import type { FillDef, KeyframeTrack, Layer, ProjectData } from "./types.js";

function hexToRgba(color?: string | FillDef): [number, number, number, number] {
  if (!color) return [0, 0, 0, 1];
  let hex = "";
  let alpha = 1;

  if (typeof color === "string") {
    hex = color;
  } else {
    hex = color.color;
    if (color.opacity !== undefined) {
      alpha = color.opacity / (color.opacity > 1 ? 100 : 1);
    }
  }

  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }

  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
    const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
    const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
    return [
      Number.parseFloat(r.toFixed(4)),
      Number.parseFloat(g.toFixed(4)),
      Number.parseFloat(b.toFixed(4)),
      alpha,
    ];
  }

  return [0, 0, 0, alpha];
}

interface BezierShape {
  c: boolean;
  v: [number, number][];
  i: [number, number][];
  o: [number, number][];
}

function parseSvgPathToLottieBezier(d: string): BezierShape {
  const vertices: [number, number][] = [];
  const inPoints: [number, number][] = [];
  const outPoints: [number, number][] = [];
  let isClosed = false;

  const commands = d.match(/([a-zA-Z])([^a-zA-Z]*)/g) || [];

  for (const cmdStr of commands) {
    const letter = cmdStr[0];
    const args = (
      cmdStr
        .slice(1)
        .trim()
        .match(/[-+]?(?:\d*\.\d+|\d+)/g) || []
    ).map(Number);

    if (!letter) continue;

    if (letter.toUpperCase() === "Z") {
      isClosed = true;
    } else if (letter === "M" || letter === "L") {
      for (let i = 0; i < args.length; i += 2) {
        const x = args[i];
        const y = args[i + 1];
        if (x !== undefined && y !== undefined) {
          vertices.push([x, y]);
          inPoints.push([0, 0]);
          outPoints.push([0, 0]);
        }
      }
    } else if (letter === "C") {
      for (let i = 0; i < args.length; i += 6) {
        const x = args[i + 4];
        const y = args[i + 5];
        if (x !== undefined && y !== undefined) {
          vertices.push([x, y]);
          inPoints.push([0, 0]);
          outPoints.push([0, 0]);
        }
      }
    }
  }

  if (vertices.length === 0) {
    vertices.push([0, 0], [100, 0]);
    inPoints.push([0, 0], [0, 0]);
    outPoints.push([0, 0], [0, 0]);
  }

  return {
    c: isClosed,
    v: vertices,
    i: inPoints,
    o: outPoints,
  };
}

interface LottieAnimatableProp<T = unknown> {
  a: number;
  k: T;
}

interface LottieTransform {
  p: LottieAnimatableProp;
  a: LottieAnimatableProp;
  s: LottieAnimatableProp;
  r: LottieAnimatableProp;
  o: LottieAnimatableProp;
}

function compileAnimatableProp<T>(
  defaultValue: T,
  track?: KeyframeTrack,
  fps = 30,
): LottieAnimatableProp {
  if (!track || track.length === 0) {
    return { a: 0, k: defaultValue };
  }

  const sorted = [...track].sort((a, b) => a.t - b.t);
  const kframes: Record<string, unknown>[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const kf = sorted[i];
    if (!kf) continue;

    const frame = Math.round(kf.t * fps);
    const val = kf.v;

    if (i < sorted.length - 1) {
      const nextKf = sorted[i + 1];
      const nextVal = nextKf ? nextKf.v : val;

      const kfObj: Record<string, unknown> = {
        t: frame,
        s: Array.isArray(val) ? val : [val],
        e: Array.isArray(nextVal) ? nextVal : [nextVal],
      };

      if (kf.ease === "hold") {
        kfObj.h = 1;
      } else {
        const handles = getBezierEasingHandles(kf.ease);
        kfObj.o = handles.o;
        kfObj.i = handles.i;
      }
      kframes.push(kfObj);
    } else {
      kframes.push({
        t: frame,
        s: Array.isArray(val) ? val : [val],
      });
    }
  }

  return { a: 1, k: kframes };
}

function compileTransform(layer: Layer, fps: number): LottieTransform {
  const kfs = layer.keyframes || {};

  const posX = layer.position ? layer.position[0] : 0;
  const posY = layer.position ? layer.position[1] : 0;
  const posVal: [number, number] = [posX ?? 0, posY ?? 0];

  const anchorX = layer.anchor ? layer.anchor[0] : 0;
  const anchorY = layer.anchor ? layer.anchor[1] : 0;
  const anchorVal: [number, number] = [anchorX ?? 0, anchorY ?? 0];

  const scaleX = layer.scale ? layer.scale[0] : 100;
  const scaleY = layer.scale ? layer.scale[1] : 100;
  const scaleVal: [number, number] = [scaleX ?? 100, scaleY ?? 100];

  const rotVal = layer.rotation ?? 0;
  const opacityVal = layer.opacity ?? 100;

  const posTrack = kfs.position || kfs.p;
  const anchorTrack = kfs.anchor || kfs.a;
  const scaleTrack = kfs.scale || kfs.s;
  const rotTrack = kfs.rotation || kfs.r;
  const opacityTrack = kfs.opacity || kfs.o;

  return {
    p: compileAnimatableProp(posVal, posTrack, fps),
    a: compileAnimatableProp(anchorVal, anchorTrack, fps),
    s: compileAnimatableProp(scaleVal, scaleTrack, fps),
    r: compileAnimatableProp(rotVal, rotTrack, fps),
    o: compileAnimatableProp(opacityVal, opacityTrack, fps),
  };
}

function compileShapeItems(layer: Layer): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const shape = layer.shape;
  const kind = shape?.kind || layer.type;

  if (kind === "rect") {
    let size: [number, number] = [100, 100];
    let radius = 0;
    if (shape && "size" in shape && shape.size) {
      size = shape.size;
    } else if (layer.size) {
      size = layer.size;
    }
    if (shape && "radius" in shape && shape.radius !== undefined) {
      radius = shape.radius;
    } else if (layer.radius !== undefined) {
      radius = layer.radius;
    }

    items.push({
      ty: "rc",
      d: 1,
      s: { a: 0, k: [size[0], size[1]] },
      p: { a: 0, k: [0, 0] },
      r: { a: 0, k: radius },
      nm: "Rectangle",
    });
  } else if (kind === "circle" || kind === "ellipse") {
    let size: [number, number] = [100, 100];
    if (shape && "size" in shape && shape.size) {
      size = shape.size;
    } else if (layer.size) {
      size = layer.size;
    }

    items.push({
      ty: "el",
      d: 1,
      s: { a: 0, k: [size[0], size[1]] },
      p: { a: 0, k: [0, 0] },
      nm: "Ellipse",
    });
  } else if (kind === "line") {
    let x1 = -50;
    let y1 = 0;
    let x2 = 50;
    let y2 = 0;

    if (shape && "x1" in shape && shape.x1 !== undefined) x1 = shape.x1;
    else if (layer.x1 !== undefined) x1 = layer.x1;

    if (shape && "y1" in shape && shape.y1 !== undefined) y1 = shape.y1;
    else if (layer.y1 !== undefined) y1 = layer.y1;

    if (shape && "x2" in shape && shape.x2 !== undefined) x2 = shape.x2;
    else if (layer.x2 !== undefined) x2 = layer.x2;

    if (shape && "y2" in shape && shape.y2 !== undefined) y2 = shape.y2;
    else if (layer.y2 !== undefined) y2 = layer.y2;

    items.push({
      ty: "sh",
      ks: {
        a: 0,
        k: {
          c: false,
          v: [
            [x1, y1],
            [x2, y2],
          ],
          i: [
            [0, 0],
            [0, 0],
          ],
          o: [
            [0, 0],
            [0, 0],
          ],
        },
      },
      nm: "Line",
    });
  } else if (kind === "polyline") {
    let pts: [number, number][] = [
      [-50, 0],
      [50, 0],
    ];
    if (shape && "points" in shape && shape.points) {
      pts = shape.points;
    } else if (layer.points) {
      pts = layer.points;
    }

    items.push({
      ty: "sh",
      ks: {
        a: 0,
        k: {
          c: false,
          v: pts,
          i: pts.map(() => [0, 0]),
          o: pts.map(() => [0, 0]),
        },
      },
      nm: "Polyline",
    });
  } else {
    // path
    let pathStr = "M -50 0 L 50 0";
    if (shape && "d" in shape && shape.d) {
      pathStr = shape.d;
    } else if (layer.d) {
      pathStr = layer.d;
    }

    items.push({
      ty: "sh",
      ks: {
        a: 0,
        k: parseSvgPathToLottieBezier(pathStr),
      },
      nm: "Path",
    });
  }

  // Fill
  if (layer.fill) {
    const rgba = hexToRgba(layer.fill);
    items.push({
      ty: "fl",
      c: { a: 0, k: [rgba[0], rgba[1], rgba[2], 1] },
      o: {
        a: 0,
        k:
          (layer.fill &&
          typeof layer.fill === "object" &&
          layer.fill.opacity !== undefined
            ? layer.fill.opacity
            : 1) * 100,
      },
      r: 1,
      nm: "Fill",
    });
  }

  // Stroke
  if (layer.stroke) {
    const rgba = hexToRgba(layer.stroke.color);
    const capMap: Record<string, number> = { butt: 1, round: 2, square: 3 };
    const joinMap: Record<string, number> = { miter: 1, round: 2, bevel: 3 };
    items.push({
      ty: "st",
      c: { a: 0, k: [rgba[0], rgba[1], rgba[2], 1] },
      o: { a: 0, k: (layer.stroke.opacity ?? 1) * 100 },
      w: { a: 0, k: layer.stroke.width },
      lc: capMap[layer.stroke.cap || "round"] || 2,
      lj: joinMap[layer.stroke.join || "round"] || 2,
      nm: "Stroke",
    });
  }

  // Transform item MUST BE LAST in shape group
  items.push({
    ty: "tr",
    p: { a: 0, k: [0, 0] },
    a: { a: 0, k: [0, 0] },
    s: { a: 0, k: [100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
    nm: "Transform",
  });

  return items;
}

export function compileProjectToLottie(
  project: ProjectData,
  options?: { prettify?: boolean },
): string {
  if (!project || !project.canvas) {
    throw new AnimatorError("Project canvas missing", {
      code: "INVALID_PROJECT",
    });
  }

  const fps = project.canvas.fps ?? 30;
  const duration = project.canvas.duration ?? 1;
  const opFrame = Math.round(duration * fps);
  const canvasW = project.canvas.width;
  const canvasH = project.canvas.height;

  const extraAssets: Record<string, unknown>[] = [];
  let precompIndex = 0;

  // Process assets provided in project
  if (project.assets) {
    for (const asset of project.assets) {
      if (asset.type === "image") {
        extraAssets.push({
          id: asset.id,
          w: asset.width ?? canvasW,
          h: asset.height ?? canvasH,
          u: "",
          p: asset.src,
        });
      }
    }
  }

  // Assign deterministic layer indices
  let nextInd = 1;

  function compileLayerList(layers: Layer[]): Record<string, unknown>[] {
    const compiledList: Record<string, unknown>[] = [];

    // Map layer id to ind
    const idToIndMap = new Map<string, number>();

    // Motion Doc order is bottom-first. Lottie is top-first.
    // Assign indices in Motion Doc order first, then reverse.
    const layersWithInd = layers.map((layer) => {
      const ind = nextInd++;
      idToIndMap.set(layer.id, ind);
      return { layer, ind };
    });

    for (const { layer, ind } of layersWithInd) {
      const inFrame = Math.round((layer.in ?? 0) * fps);
      const outFrame = Math.round((layer.out ?? duration) * fps);
      const ks = compileTransform(layer, fps);
      const layerName = layer.name || layer.id;

      const baseLottieLayer: Record<string, unknown> = {
        ind,
        ip: inFrame,
        op: outFrame,
        ks,
        nm: layerName,
      };

      if (layer.parent && idToIndMap.has(layer.parent)) {
        baseLottieLayer.parent = idToIndMap.get(layer.parent);
      }

      const isShapeType =
        layer.type === "shape" ||
        layer.type === "rect" ||
        layer.type === "circle" ||
        layer.type === "ellipse" ||
        layer.type === "line" ||
        layer.type === "polyline" ||
        layer.type === "path";

      if (isShapeType) {
        baseLottieLayer.ty = 4;
        const items = compileShapeItems(layer);
        baseLottieLayer.shapes = [
          {
            ty: "gr",
            it: items,
            nm: layerName,
            np: items.length,
            cix: 2,
            ix: 1,
          },
        ];
      } else if (layer.type === "image") {
        baseLottieLayer.ty = 2;
        baseLottieLayer.refId = layer.asset || layer.id;
      } else if (layer.type === "text") {
        baseLottieLayer.ty = 5;
        const fontFam = layer.font?.family || "Arial";
        const fontSize = layer.font?.size || 24;
        const fontColor = hexToRgba(layer.fill || "#000000");
        const alignMap: Record<string, number> = {
          left: 0,
          right: 1,
          center: 2,
        };
        const alignNum = alignMap[layer.align || "left"] || 0;

        baseLottieLayer.t = {
          d: {
            k: [
              {
                s: {
                  t: layer.text || "",
                  f: fontFam,
                  s: fontSize,
                  fc: [fontColor[0], fontColor[1], fontColor[2]],
                  j: alignNum,
                  lh: layer.lineHeight || fontSize * 1.2,
                },
                t: 0,
              },
            ],
          },
        };
      } else if (layer.type === "group" || layer.type === "container") {
        baseLottieLayer.ty = 0;
        const compId = `comp_${precompIndex++}`;
        baseLottieLayer.refId = compId;
        baseLottieLayer.w = canvasW;
        baseLottieLayer.h = canvasH;

        const childrenCompiled = compileLayerList(layer.children || []);
        extraAssets.push({
          id: compId,
          layers: childrenCompiled,
        });
      } else {
        // Fallback shape layer
        baseLottieLayer.ty = 4;
        baseLottieLayer.shapes = [];
      }

      compiledList.push(baseLottieLayer);
    }

    // Reverse layer order so top layer comes first in Lottie array
    return compiledList.reverse();
  }

  const compiledLayers = compileLayerList(project.layers || []);

  const lottieDoc = {
    v: "5.7.0",
    fr: fps,
    ip: 0,
    op: opFrame,
    w: canvasW,
    h: canvasH,
    nm: project.name || "Animator Animation",
    assets: extraAssets,
    layers: compiledLayers,
  };

  return JSON.stringify(lottieDoc, null, options?.prettify ? 2 : undefined);
}
