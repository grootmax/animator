import { z } from "zod";
import { AnimatorError } from "./errors.js";

/** Regex matching a parameter substitution slot, e.g. `{{accent}}` */
export const PARAM_SLOT_REGEX = /^\{\{([a-zA-Z0-9_-]+)\}\}$/;

/** Regex matching any parameter slot occurrence within a template string */
export const PARAM_FIND_REGEX = /\{\{([a-zA-Z0-9_-]+)\}\}/g;

/** Schema for hex colors or parameter substitutions */
export const ColorOrParamSchema = z
  .string()
  .refine(
    (val) =>
      /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(
        val,
      ) || PARAM_SLOT_REGEX.test(val),
    {
      message:
        "Must be a valid hex color (#RGB, #RGBA, #RRGGBB, #RRGGBBAA) or parameter substitution ({{name}})",
    },
  );

export const CanvasSchema = z
  .object({
    width: z.number().int().positive("Canvas width must be a positive integer"),
    height: z
      .number()
      .int()
      .positive("Canvas height must be a positive integer"),
    fps: z.number().positive("Canvas fps must be a positive number"),
    duration: z.number().positive("Canvas duration must be a positive number"),
    background: ColorOrParamSchema.optional(),
  })
  .strict();

export type Canvas = z.infer<typeof CanvasSchema>;

export const ParamSchema = z
  .object({
    type: z.enum(["color", "text", "number"]),
    value: z.union([z.string(), z.number()]),
    label: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  })
  .strict();

export type Param = z.infer<typeof ParamSchema>;

export const AssetOriginSchema = z
  .object({
    kind: z.string(),
    provider: z.string().optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
  })
  .strict();

export type AssetOrigin = z.infer<typeof AssetOriginSchema>;

export const AssetSchema = z
  .object({
    id: z.string().min(1, "Asset ID cannot be empty"),
    type: z.enum(["image", "video", "svg", "lottie", "font"]),
    src: z.string().min(1, "Asset src cannot be empty"),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    durationSec: z.number().positive().optional(),
    origin: AssetOriginSchema.optional(),
    data: z.unknown().optional(),
  })
  .strict();

export type Asset = z.infer<typeof AssetSchema>;

export const EaseNameSchema = z.enum([
  "linear",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "spring",
  "hold",
]);

export type EaseName = z.infer<typeof EaseNameSchema>;

export const CubicBezierSchema = z.tuple([
  z.number().min(0).max(1),
  z.number(),
  z.number().min(0).max(1),
  z.number(),
]);

export type CubicBezier = z.infer<typeof CubicBezierSchema>;

export const KeyframeEaseSchema = z.union([
  EaseNameSchema,
  CubicBezierSchema,
  z.literal("hold"),
  z.string(),
]);

export const KeyframeSchema = z
  .object({
    t: z.number().min(0, "Keyframe time must be non-negative"),
    v: z.unknown(),
    ease: KeyframeEaseSchema.optional(),
  })
  .strict();

export type Keyframe = z.infer<typeof KeyframeSchema>;

export const PresetRefSchema = z
  .object({
    name: z.string().min(1, "Preset name cannot be empty"),
    at: z.number().min(0, "Preset start time must be non-negative"),
    duration: z.number().min(0, "Preset duration must be non-negative"),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type PresetRef = z.infer<typeof PresetRefSchema>;

export const StaggerSchema = z
  .object({
    name: z.literal("stagger"),
    targets: z
      .array(z.string())
      .min(1, "Stagger must have at least one target"),
    preset: z.string().min(1, "Preset name cannot be empty"),
    at: z.number().min(0, "Stagger start time must be non-negative"),
    step: z.number().positive("Stagger step must be positive"),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Stagger = z.infer<typeof StaggerSchema>;

export const VideoClipSchema = z
  .object({
    id: z.string().min(1, "Video clip ID cannot be empty"),
    asset: z.string().min(1, "Video clip asset reference cannot be empty"),
    at: z.number().min(0, "Clip start time must be non-negative"),
    trimIn: z.number().min(0, "Clip trimIn must be non-negative"),
    duration: z.number().positive("Clip duration must be positive"),
    placement: z.enum(["under", "over"]).optional().default("under"),
  })
  .strict();

export type VideoClip = z.infer<typeof VideoClipSchema>;

const BaseLayerFields = {
  id: z.string().min(1, "Layer ID cannot be empty"),
  name: z.string().optional(),
  position: z.tuple([z.number(), z.number()]).optional(),
  anchor: z
    .union([
      z.tuple([z.number(), z.number()]),
      z.literal("center"),
      z.literal("top-left"),
      z.string(),
    ])
    .optional(),
  scale: z.tuple([z.number(), z.number()]).optional(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(100).optional(),
  visible: z.boolean().optional(),
  blend: z
    .enum(["normal", "multiply", "screen", "overlay", "darken", "lighten"])
    .optional(),
  in: z.number().min(0).optional(),
  out: z.number().positive().optional(),
  parent: z.string().nullable().optional(),
  keyframes: z.record(z.string(), z.array(KeyframeSchema)).optional(),
  presets: z.array(PresetRefSchema).optional(),
  mask: z.unknown().optional(),
  matte: z.unknown().optional(),
};

export const RectShapeSchema = z
  .object({
    kind: z.literal("rect"),
    size: z.tuple([z.number().positive(), z.number().positive()]),
    radius: z
      .union([
        z.number().min(0),
        z.tuple([
          z.number().min(0),
          z.number().min(0),
          z.number().min(0),
          z.number().min(0),
        ]),
      ])
      .optional(),
  })
  .strict();

export const EllipseShapeSchema = z
  .object({
    kind: z.literal("ellipse"),
    size: z.tuple([z.number().positive(), z.number().positive()]),
  })
  .strict();

export const PathShapeSchema = z
  .object({
    kind: z.literal("path"),
    d: z.string().min(1, "Path SVG d cannot be empty"),
  })
  .strict();

export const PolygonShapeSchema = z
  .object({
    kind: z.literal("polygon"),
    points: z.number().int().min(3, "Polygon must have at least 3 points"),
    radius: z.number().positive("Polygon radius must be positive"),
  })
  .strict();

export const StarShapeSchema = z
  .object({
    kind: z.literal("star"),
    points: z.number().int().min(3, "Star must have at least 3 points"),
    innerRadius: z.number().positive("Star innerRadius must be positive"),
    outerRadius: z.number().positive("Star outerRadius must be positive"),
  })
  .strict();

export const ShapeGeometrySchema = z.discriminatedUnion("kind", [
  RectShapeSchema,
  EllipseShapeSchema,
  PathShapeSchema,
  PolygonShapeSchema,
  StarShapeSchema,
]);

export type ShapeGeometry = z.infer<typeof ShapeGeometrySchema>;

export const StrokeSchema = z
  .object({
    color: z.string().min(1, "Stroke color cannot be empty"),
    width: z.number().positive("Stroke width must be positive"),
    cap: z.enum(["butt", "round", "square"]).optional(),
    join: z.enum(["miter", "round", "bevel"]).optional(),
    dash: z.array(z.number().positive()).optional(),
  })
  .strict();

export type Stroke = z.infer<typeof StrokeSchema>;

export const GradientStopSchema = z
  .object({
    offset: z.number().min(0).max(1),
    color: z.string().min(1),
  })
  .strict();

export const GradientSchema = z
  .object({
    type: z.enum(["linear", "radial"]),
    start: z.tuple([z.number(), z.number()]),
    end: z.tuple([z.number(), z.number()]),
    stops: z
      .array(GradientStopSchema)
      .min(2, "Gradient must have at least 2 stops"),
  })
  .strict();

export type Gradient = z.infer<typeof GradientSchema>;

export const TrimSchema = z
  .object({
    start: z.number().min(0).max(100).optional(),
    end: z.number().min(0).max(100).optional(),
    offset: z.number().optional(),
  })
  .strict();

export type Trim = z.infer<typeof TrimSchema>;

export const ShapeLayerSchema = z
  .object({
    ...BaseLayerFields,
    type: z.literal("shape"),
    shape: ShapeGeometrySchema,
    fill: z.string().optional(),
    stroke: StrokeSchema.optional(),
    gradient: GradientSchema.optional(),
    trim: TrimSchema.optional(),
  })
  .strict();

export type ShapeLayer = z.infer<typeof ShapeLayerSchema>;

export const FontSchema = z
  .object({
    family: z.string().min(1, "Font family cannot be empty"),
    weight: z.union([z.number(), z.string()]).optional(),
    size: z.number().positive("Font size must be positive"),
  })
  .strict();

export type Font = z.infer<typeof FontSchema>;

export const TextLayerSchema = z
  .object({
    ...BaseLayerFields,
    type: z.literal("text"),
    text: z.string(),
    font: FontSchema.optional(),
    fill: z.string().optional(),
    stroke: StrokeSchema.optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    lineHeight: z.number().positive().optional(),
    maxWidth: z.number().positive().optional(),
    native: z.boolean().optional(),
  })
  .strict();

export type TextLayer = z.infer<typeof TextLayerSchema>;

export const ImageLayerSchema = z
  .object({
    ...BaseLayerFields,
    type: z.literal("image"),
    asset: z.string().min(1, "Image asset reference cannot be empty"),
    size: z.tuple([z.number().positive(), z.number().positive()]).optional(),
    fit: z.enum(["contain", "cover", "fill", "none"]).optional(),
  })
  .strict();

export type ImageLayer = z.infer<typeof ImageLayerSchema>;

export const LottieLayerSchema = z
  .object({
    ...BaseLayerFields,
    type: z.literal("lottie"),
    asset: z.string().min(1, "Lottie asset reference cannot be empty"),
    timeOffset: z.number().optional(),
    speed: z.number().optional(),
  })
  .strict();

export type LottieLayer = z.infer<typeof LottieLayerSchema>;

export interface GroupLayer {
  id: string;
  type: "group";
  name?: string | undefined;
  position?: [number, number] | undefined;
  anchor?: [number, number] | string | undefined;
  scale?: [number, number] | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  blend?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | undefined;
  in?: number | undefined;
  out?: number | undefined;
  parent?: string | null | undefined;
  keyframes?: Record<string, Keyframe[]> | undefined;
  presets?: PresetRef[] | undefined;
  mask?: unknown;
  matte?: unknown;
  children: Layer[];
}

export type Layer =
  | ShapeLayer
  | TextLayer
  | ImageLayer
  | GroupLayer
  | LottieLayer;

// Lazy reference for recursion
export const LayerSchema: z.ZodType<Layer> = z.lazy(
  () => LayerUnion as unknown as z.ZodType<Layer>,
);

export const GroupLayerSchema = z
  .object({
    ...BaseLayerFields,
    type: z.literal("group"),
    children: z.array(LayerSchema),
  })
  .strict();

export const LayerUnion = z.discriminatedUnion("type", [
  ShapeLayerSchema,
  TextLayerSchema,
  ImageLayerSchema,
  GroupLayerSchema,
  LottieLayerSchema,
]);

export const MotionDocSchema = z
  .object({
    version: z.number().int().positive().default(1),
    name: z.string().optional(),
    canvas: CanvasSchema,
    params: z.record(z.string(), ParamSchema).optional(),
    assets: z.array(AssetSchema).optional(),
    layers: z.array(LayerSchema),
    staggers: z.array(StaggerSchema).optional(),
    videoTrack: z.array(VideoClipSchema).optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict();

export type MotionDoc = z.infer<typeof MotionDocSchema>;

/**
 * Validates the layer hierarchy to ensure:
 * 1. All layer IDs are unique across top-level and nested groups.
 * 2. No layer is its own parent (self-reference).
 * 3. No cycles exist in parent-child relationships (via `parent` property or `group.children`).
 */
export function validateHierarchy(layers: readonly Layer[]): void {
  const allLayers = new Map<string, Layer>();
  const parentMap = new Map<string, string>();

  function collect(
    layerList: readonly Layer[],
    parentId?: string,
    pathPrefix = "layers",
  ): void {
    for (let i = 0; i < layerList.length; i++) {
      const layer = layerList[i];
      if (!layer) continue;
      const currentPath = `${pathPrefix}[${i}]`;

      if (allLayers.has(layer.id)) {
        throw new AnimatorError(`Duplicate layer ID "${layer.id}"`, {
          code: "ERR_DUPLICATE_LAYER_ID",
          path: `${currentPath}.id`,
          hint: `Layer IDs must be unique across the document. Change id "${layer.id}".`,
        });
      }
      allLayers.set(layer.id, layer);

      if (layer.parent === layer.id) {
        throw new AnimatorError(
          `Layer "${layer.id}" cannot reference itself as parent`,
          {
            code: "ERR_SELF_REFERENCE",
            path: `${currentPath}.parent`,
            hint: `Remove or change the parent property on layer "${layer.id}".`,
          },
        );
      }

      if (layer.parent) {
        parentMap.set(layer.id, layer.parent);
      } else if (parentId) {
        parentMap.set(layer.id, parentId);
      }

      if (layer.type === "group" && layer.children) {
        for (let j = 0; j < layer.children.length; j++) {
          const child = layer.children[j];
          if (child && child.id === layer.id) {
            throw new AnimatorError(
              `Group layer "${layer.id}" cannot contain itself as a child`,
              {
                code: "ERR_HIERARCHY_CYCLE",
                path: `${currentPath}.children[${j}]`,
                hint: `Remove layer "${child.id}" from its own children.`,
              },
            );
          }
        }
        collect(layer.children, layer.id, `${currentPath}.children`);
      }
    }
  }

  collect(layers);

  // Detect cyclic parent references
  for (const [childId, parentId] of parentMap.entries()) {
    const visited = new Set<string>([childId]);
    let curr: string | undefined = parentId;
    while (curr) {
      if (visited.has(curr)) {
        throw new AnimatorError(
          `Hierarchy cycle detected in layer parent graph: ${[...visited, curr].join(" -> ")}`,
          {
            code: "ERR_HIERARCHY_CYCLE",
            path: `layers[${childId}].parent`,
            hint: `Break the cyclic parent-child relationship involving layer "${curr}".`,
          },
        );
      }
      visited.add(curr);
      curr = parentMap.get(curr);
    }
  }
}

/**
 * Validates parameter slot references within a document.
 * If params are defined or referenced, ensures valid syntax and references exist.
 */
export function validateDocParams(doc: MotionDoc): void {
  const definedParams = new Set(Object.keys(doc.params || {}));

  function checkParamString(val: string | undefined, path: string): void {
    if (!val) return;
    const matches = val.matchAll(PARAM_FIND_REGEX);
    for (const match of matches) {
      const paramName = match[1];
      if (paramName && doc.params && !definedParams.has(paramName)) {
        throw new AnimatorError(
          `Parameter "${paramName}" is referenced but not declared in doc.params`,
          {
            code: "ERR_UNDEFINED_PARAM",
            path,
            hint: `Define parameter "${paramName}" in doc.params or update the reference.`,
          },
        );
      }
    }
  }

  if (doc.canvas.background) {
    checkParamString(doc.canvas.background, "canvas.background");
  }

  function checkLayers(layers: readonly Layer[], pathPrefix = "layers"): void {
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer) continue;
      const layerPath = `${pathPrefix}[${i}]`;

      if (layer.type === "text") {
        checkParamString(layer.text, `${layerPath}.text`);
        checkParamString(layer.fill, `${layerPath}.fill`);
      } else if (layer.type === "shape") {
        checkParamString(layer.fill, `${layerPath}.fill`);
        if (layer.stroke) {
          checkParamString(layer.stroke.color, `${layerPath}.stroke.color`);
        }
      }

      if (layer.type === "group" && layer.children) {
        checkLayers(layer.children, `${layerPath}.children`);
      }
    }
  }

  checkLayers(doc.layers);
}

/**
 * Parses and strictly validates a MotionDoc object.
 * Throws AnimatorError on any validation error, unknown field, cycle, or invalid param.
 */
export function parseMotionDoc(input: unknown): MotionDoc {
  const result = MotionDocSchema.safeParse(input);
  if (!result.success) {
    throw AnimatorError.fromZodError(result.error);
  }
  const doc = result.data;
  validateHierarchy(doc.layers);
  validateDocParams(doc);
  return doc;
}

/**
 * Validates a MotionDoc safely without throwing, returning a result object.
 */
export function validateMotionDoc(
  input: unknown,
):
  | { success: true; doc: MotionDoc }
  | { success: false; error: AnimatorError } {
  try {
    const doc = parseMotionDoc(input);
    return { success: true, doc };
  } catch (err) {
    if (err instanceof AnimatorError) {
      return { success: false, error: err };
    }
    return {
      success: false,
      error: new AnimatorError(
        err instanceof Error ? err.message : "Validation failed",
        { code: "ERR_VALIDATION" },
      ),
    };
  }
}
