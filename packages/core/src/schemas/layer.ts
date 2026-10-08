import { z } from "zod";
import { KeyframeSchema } from "./keyframe.js";
import { PresetRefSchema } from "./preset.js";

const BaseLayerFields = {
  id: z.string(),
  name: z.string().optional(),
  position: z.tuple([z.number(), z.number()]).optional(),
  anchor: z.union([z.string(), z.tuple([z.number(), z.number()])]).optional(),
  scale: z.tuple([z.number(), z.number()]).optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  blend: z.string().optional(),
  in: z.number().optional(),
  out: z.number().optional(),
  parent: z.string().optional(),
  keyframes: z.record(z.string(), z.array(KeyframeSchema)).optional(),
  presets: z.array(PresetRefSchema).optional(),
};

export const RectShapeSchema = z.object({
  kind: z.literal("rect"),
  size: z.tuple([z.number(), z.number()]),
  radius: z.number().optional(),
});

export const EllipseShapeSchema = z.object({
  kind: z.literal("ellipse"),
  size: z.tuple([z.number(), z.number()]),
});

export const PathShapeSchema = z.object({
  kind: z.literal("path"),
  d: z.string(),
});

export const PolygonStarShapeSchema = z.object({
  kind: z.enum(["polygon", "star"]),
  points: z.number(),
  outerRadius: z.number(),
  innerRadius: z.number().optional(),
});

export const ShapeKindSchema = z.discriminatedUnion("kind", [
  RectShapeSchema,
  EllipseShapeSchema,
  PathShapeSchema,
  PolygonStarShapeSchema,
]);

export const StrokeSchema = z.object({
  color: z.string(),
  width: z.number(),
  cap: z.enum(["butt", "round", "square"]).optional(),
  join: z.enum(["miter", "round", "bevel"]).optional(),
});

export const ShapeLayerSchema = z.object({
  ...BaseLayerFields,
  type: z.literal("shape"),
  shape: ShapeKindSchema,
  fill: z.string().optional(),
  stroke: StrokeSchema.optional(),
});

export const FontSchema = z.object({
  family: z.string(),
  weight: z.number().optional(),
  size: z.number(),
});

export const TextLayerSchema = z.object({
  ...BaseLayerFields,
  type: z.literal("text"),
  text: z.string(),
  font: FontSchema,
  fill: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  lineHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  native: z.boolean().optional(),
});

export const ImageLayerSchema = z.object({
  ...BaseLayerFields,
  type: z.literal("image"),
  asset: z.string(),
  size: z.tuple([z.number(), z.number()]).optional(),
  fit: z.enum(["contain", "cover", "fill"]).optional(),
});

export const LottieLayerSchema = z.object({
  ...BaseLayerFields,
  type: z.literal("lottie"),
  asset: z.string(),
  timeOffset: z.number().optional(),
  speed: z.number().optional(),
});

export type ShapeLayer = z.infer<typeof ShapeLayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type ImageLayer = z.infer<typeof ImageLayerSchema>;
export type LottieLayer = z.infer<typeof LottieLayerSchema>;

export type GroupLayer = {
  id: string;
  type: "group";
  name?: string | undefined;
  position?: [number, number] | undefined;
  anchor?: string | [number, number] | undefined;
  scale?: [number, number] | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  blend?: string | undefined;
  in?: number | undefined;
  out?: number | undefined;
  parent?: string | undefined;
  keyframes?: Record<string, z.infer<typeof KeyframeSchema>[]> | undefined;
  presets?: z.infer<typeof PresetRefSchema>[] | undefined;
  children: Layer[];
};

export type Layer =
  | ShapeLayer
  | TextLayer
  | ImageLayer
  | LottieLayer
  | GroupLayer;

export const GroupLayerSchema: z.ZodType<GroupLayer> = z.lazy(() =>
  z.object({
    ...BaseLayerFields,
    type: z.literal("group"),
    children: z.array(LayerSchema),
  }),
);

export const LayerSchema: z.ZodType<Layer> = z.lazy(() =>
  z.union([
    ShapeLayerSchema,
    TextLayerSchema,
    ImageLayerSchema,
    LottieLayerSchema,
    GroupLayerSchema,
  ]),
);

export const LayersSchema = z.array(LayerSchema);
