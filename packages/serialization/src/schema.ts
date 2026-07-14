import { z } from 'zod';

const NodeTypeSchema = z.enum([
  'container',
  'rect',
  'circle',
  'path',
  'group',
  'ellipse',
  'line',
  'polyline'
]);

export const SceneNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: NodeTypeSchema,
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
  points: z.string().optional()
});

const EasingTypeSchema = z.enum([
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad'
]);

export const KeyframeSchema = z.object({
  time: z.number().nonnegative(),
  value: z.number(),
  easing: EasingTypeSchema.optional()
});

export const TrackSchema = z.object({
  nodeId: z.string(),
  property: z.enum(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity']),
  keyframes: z.array(KeyframeSchema)
});

export const MetadataSchema = z.object({
  version: z.string(),
  duration: z.number().nonnegative()
});

export const ExportedProjectSchema = z.object({
  scene: z.record(z.string(), SceneNodeSchema),
  animations: z.array(TrackSchema),
  metadata: MetadataSchema
}).strict();
