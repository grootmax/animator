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
  name: z.string().optional().default('Node'),
  type: NodeTypeSchema,
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  rotation: z.number().optional().default(0),
  scaleX: z.number().optional().default(1),
  scaleY: z.number().optional().default(1),
  skewX: z.number().optional(),
  skewY: z.number().optional(),
  opacity: z.number().optional().default(1),
  visible: z.boolean().optional().default(true),
  locked: z.boolean().optional().default(false),
  
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
  id: z.string().optional(),
  time: z.number().nonnegative(),
  value: z.union([z.number(), z.string()]),
  easing: EasingTypeSchema.optional()
});

export const TrackSchema = z.object({
  nodeId: z.string(),
  property: z.enum(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'fill', 'stroke', 'pathData']),
  keyframes: z.array(KeyframeSchema)
});

export const MetadataSchema = z.object({
  version: z.string().optional().default('1.0.0'),
  duration: z.number().nonnegative().optional().default(0)
});

export const ExportedProjectSchema = z.object({
  scene: z.record(z.string(), SceneNodeSchema),
  animations: z.array(TrackSchema),
  metadata: MetadataSchema
}).strict();
