import { z } from 'zod';

export const nodeTypeSchema = z.enum(['container', 'rect', 'circle', 'path', 'group', 'ellipse', 'line', 'polyline']);

// This schema defines only the properties we want to serialize.
// By default, z.object() will strip out any extra properties (like localMatrix, worldMatrix, isDirty).
export const sceneNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  skewX: z.number().optional(),
  skewY: z.number().optional(),
  opacity: z.number(),
  visible: z.boolean(),
  locked: z.boolean(),
  width: z.number().optional(),
  height: z.number().optional(),
  radius: z.number().optional(),
  pathData: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  rx: z.number().optional(),
  ry: z.number().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  points: z.string().optional(),
});

export const easingTypeSchema = z.enum(['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad']);

export const keyframeSchema = z.object({
  time: z.number(),
  value: z.number(),
  easing: easingTypeSchema.optional(),
});

export const trackSchema = z.object({
  nodeId: z.string(),
  property: z.enum(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity']),
  keyframes: z.array(keyframeSchema),
});

export const projectMetadataSchema = z.object({
  version: z.string(),
  duration: z.number(),
});

export const projectDataSchema = z.object({
  scene: z.record(z.string(), sceneNodeSchema),
  animations: z.array(trackSchema),
  metadata: projectMetadataSchema,
});

export function validateAndSerializeProject(data: unknown): string {
  // Parses the data, throws an error if invalid, and strips unregistered keys
  const parsed = projectDataSchema.parse(data);
  return JSON.stringify(parsed, null, 2);
}
