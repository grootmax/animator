import { z } from "zod";

export const nodeTypeSchema = z.enum([
  "container",
  "rect",
  "circle",
  "ellipse",
  "path",
  "line",
  "polyline",
  "text",
  "group",
  "image",
]);

export const sceneNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  parentId: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  rotation: z.number().optional(),
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  skewX: z.number().optional(),
  skewY: z.number().optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  radius: z.number().optional(),
  rx: z.number().optional(),
  ry: z.number().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  points: z.string().optional(),
  pathData: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  order: z.string().optional(),
  src: z.string().optional(),
  // Text node properties
  text: z.string().optional(),
  fontAssetId: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  fontStyle: z.string().optional(),
  textAlign: z.string().optional(),
  fontUrl: z.string().optional(),
  localMatrix: z.array(z.number()).optional(),
});

export const fontAssetSchema = z.object({
  id: z.string(),
  family: z.string(),
  src: z.string(),
  weight: z.string().optional(),
  style: z.string().optional(),
  format: z.string().optional(),
});

export const projectMetadataSchema = z.object({
  version: z.string(),
  duration: z.number(),
});

export const projectDataSchema = z.object({
  scene: z.record(z.string(), sceneNodeSchema),
  fontAssets: z.record(z.string(), fontAssetSchema).optional(),
  metadata: projectMetadataSchema,
});

export function validateAndSerializeProject(data: unknown): string {
  const parsed = projectDataSchema.parse(data);
  return JSON.stringify(parsed, null, 2);
}
