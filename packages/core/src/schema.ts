import { z } from "zod";
import { AnimatorError } from "./errors.js";

// --- Canvas ---
export const CanvasSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  duration: z.number().positive(),
  background: z.string().optional(),
});
export type Canvas = z.infer<typeof CanvasSchema>;

// --- Param ---
export const ParamTypeSchema = z
  .enum(["color", "text", "number"])
  .or(z.string());
export type ParamType = z.infer<typeof ParamTypeSchema>;

export const ParamSchema = z.object({
  type: ParamTypeSchema,
  value: z.union([z.string(), z.number()]),
  label: z.string().optional(),
  default: z.union([z.string(), z.number()]).optional(),
});
export type Param = z.infer<typeof ParamSchema>;

// --- Asset ---
export const AssetTypeSchema = z
  .enum(["image", "video", "svg", "lottie", "font"])
  .or(z.string());
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetOriginSchema = z
  .object({
    kind: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
  })
  .passthrough();
export type AssetOrigin = z.infer<typeof AssetOriginSchema>;

export const AssetSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  src: z.string().min(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  durationSec: z.number().positive().optional(),
  origin: AssetOriginSchema.optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

// --- Keyframes & Animation ---
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

export const BezierEaseSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export type BezierEase = z.infer<typeof BezierEaseSchema>;

export const EaseSchema = z.union([
  EaseNameSchema,
  BezierEaseSchema,
  z.string(),
]);
export type Ease = z.infer<typeof EaseSchema>;

export const KeyframeSchema = z.object({
  t: z.number(),
  v: z.unknown(),
  ease: EaseSchema.optional(),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

// --- PresetRef ---
export const PresetRefSchema = z.object({
  name: z.string().min(1),
  at: z.number(),
  duration: z.number().nonnegative(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type PresetRef = z.infer<typeof PresetRefSchema>;

// --- Stagger ---
export const StaggerSchema = z.object({
  name: z.string().optional(),
  targets: z.array(z.string()),
  preset: z.string().min(1),
  at: z.number(),
  step: z.number(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type Stagger = z.infer<typeof StaggerSchema>;

// --- VideoClip ---
export const VideoClipPlacementSchema = z.enum(["under", "over"]);
export type VideoClipPlacement = z.infer<typeof VideoClipPlacementSchema>;

export const VideoClipSchema = z.object({
  id: z.string().min(1),
  asset: z.string().min(1),
  at: z.number(),
  trimIn: z.number().nonnegative().optional(),
  duration: z.number().positive(),
  placement: VideoClipPlacementSchema.optional(),
});
export type VideoClip = z.infer<typeof VideoClipSchema>;

// --- Shape Definitions ---
export const RectShapeSchema = z.object({
  kind: z.literal("rect"),
  size: z.tuple([z.number(), z.number()]).or(z.array(z.number())),
  radius: z.union([z.number(), z.array(z.number())]).optional(),
});

export const EllipseShapeSchema = z.object({
  kind: z.literal("ellipse"),
  size: z.tuple([z.number(), z.number()]).or(z.array(z.number())),
});

export const PathShapeSchema = z.object({
  kind: z.literal("path"),
  d: z.string(),
});

export const PolygonShapeSchema = z.object({
  kind: z.literal("polygon"),
  points: z.number().int().positive(),
  radius: z.number().optional(),
});

export const StarShapeSchema = z.object({
  kind: z.literal("star"),
  points: z.number().int().positive(),
  radius: z.number().optional(),
  innerRadius: z.number().optional(),
});

export const CustomShapeSchema = z
  .object({
    kind: z.string(),
  })
  .passthrough();

export const ShapeDefSchema = z.union([
  RectShapeSchema,
  EllipseShapeSchema,
  PathShapeSchema,
  PolygonShapeSchema,
  StarShapeSchema,
  CustomShapeSchema,
]);
export type ShapeDef = z.infer<typeof ShapeDefSchema>;

export const StrokeCapSchema = z.enum(["butt", "round", "square"]);
export type StrokeCap = z.infer<typeof StrokeCapSchema>;

export const StrokeJoinSchema = z.enum(["miter", "round", "bevel"]);
export type StrokeJoin = z.infer<typeof StrokeJoinSchema>;

export const StrokeDefSchema = z.object({
  color: z.string(),
  width: z.number().nonnegative(),
  cap: StrokeCapSchema.optional(),
  join: StrokeJoinSchema.optional(),
  dash: z.array(z.number()).optional(),
});
export type StrokeDef = z.infer<typeof StrokeDefSchema>;

export const FontDefSchema = z.object({
  family: z.string(),
  weight: z.union([z.number(), z.string()]).optional(),
  size: z.number().positive(),
});
export type FontDef = z.infer<typeof FontDefSchema>;

export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const ImageFitSchema = z.enum(["cover", "contain", "fill", "none"]);
export type ImageFit = z.infer<typeof ImageFitSchema>;

// --- Layer Types ---
export interface BaseLayer {
  id: string;
  name?: string | undefined;
  position?: [number, number] | number[] | undefined;
  anchor?: [number, number] | number[] | "center" | string | undefined;
  scale?: [number, number] | number[] | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  blend?: string | undefined;
  in?: number | undefined;
  out?: number | undefined;
  parent?: string | undefined;
  mask?: unknown;
  matte?: unknown;
  keyframes?: Record<string, Keyframe[]> | undefined;
  presets?: PresetRef[] | undefined;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: ShapeDef;
  fill?: string | undefined;
  stroke?: StrokeDef | undefined;
  gradient?: Record<string, unknown> | undefined;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  font?: FontDef | undefined;
  fill?: string | undefined;
  stroke?: StrokeDef | undefined;
  align?: TextAlign | undefined;
  lineHeight?: number | undefined;
  maxWidth?: number | undefined;
  native?: boolean | undefined;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  asset: string;
  size?: [number, number] | number[] | undefined;
  fit?: ImageFit | undefined;
}

export interface GroupLayer extends BaseLayer {
  type: "group";
  children?: Layer[] | undefined;
}

export interface LottieLayer extends BaseLayer {
  type: "lottie";
  asset: string;
  timeOffset?: number | undefined;
  speed?: number | undefined;
}

export type Layer =
  | ShapeLayer
  | TextLayer
  | ImageLayer
  | GroupLayer
  | LottieLayer;

const BaseLayerProps = {
  id: z.string().min(1),
  name: z.string().optional(),
  position: z
    .tuple([z.number(), z.number()])
    .or(z.array(z.number()))
    .optional(),
  anchor: z
    .union([
      z.tuple([z.number(), z.number()]),
      z.array(z.number()),
      z.literal("center"),
      z.string(),
    ])
    .optional(),
  scale: z.tuple([z.number(), z.number()]).or(z.array(z.number())).optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  blend: z.string().optional(),
  in: z.number().optional(),
  out: z.number().optional(),
  parent: z.string().optional(),
  mask: z.unknown().optional(),
  matte: z.unknown().optional(),
  keyframes: z.record(z.string(), z.array(KeyframeSchema)).optional(),
  presets: z.array(PresetRefSchema).optional(),
};

export const ShapeLayerSchema = z.object({
  ...BaseLayerProps,
  type: z.literal("shape"),
  shape: ShapeDefSchema,
  fill: z.string().optional(),
  stroke: StrokeDefSchema.optional(),
  gradient: z.record(z.string(), z.unknown()).optional(),
});

export const TextLayerSchema = z.object({
  ...BaseLayerProps,
  type: z.literal("text"),
  text: z.string(),
  font: FontDefSchema.optional(),
  fill: z.string().optional(),
  stroke: StrokeDefSchema.optional(),
  align: TextAlignSchema.optional(),
  lineHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  native: z.boolean().optional(),
});

export const ImageLayerSchema = z.object({
  ...BaseLayerProps,
  type: z.literal("image"),
  asset: z.string().min(1),
  size: z.tuple([z.number(), z.number()]).or(z.array(z.number())).optional(),
  fit: ImageFitSchema.optional(),
});

export const LottieLayerSchema = z.object({
  ...BaseLayerProps,
  type: z.literal("lottie"),
  asset: z.string().min(1),
  timeOffset: z.number().optional(),
  speed: z.number().optional(),
});

export const GroupLayerSchema: z.ZodType<GroupLayer> = z.object({
  ...BaseLayerProps,
  type: z.literal("group"),
  children: z.lazy(() => z.array(LayerSchema)).optional(),
});

export const LayerSchema: z.ZodType<Layer> = z.union([
  ShapeLayerSchema,
  TextLayerSchema,
  ImageLayerSchema,
  GroupLayerSchema,
  LottieLayerSchema,
]);

// --- MotionDoc ---
export const MotionDocSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().min(1),
  canvas: CanvasSchema,
  params: z.record(z.string(), ParamSchema).optional(),
  assets: z.array(AssetSchema).optional(),
  layers: z.array(LayerSchema),
  staggers: z.array(StaggerSchema).optional(),
  videoTrack: z.array(VideoClipSchema).optional(),
  revision: z.number().int().nonnegative().optional(),
});
export type MotionDoc = z.infer<typeof MotionDocSchema>;

export function parseMotionDoc(data: unknown): MotionDoc {
  const result = MotionDocSchema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const pathStr = firstIssue ? firstIssue.path.join(".") : "";
    const msg = firstIssue
      ? `${firstIssue.message} at ${pathStr}`
      : "Invalid Motion Doc payload";
    throw new AnimatorError(msg, {
      code: "SCHEMA_VALIDATION_ERROR",
      path: pathStr,
      hint: "Ensure the Motion Doc adheres to the schema specification",
      metadata: { issues: result.error.issues },
    });
  }
  return result.data;
}

export const validateMotionDoc = parseMotionDoc;
