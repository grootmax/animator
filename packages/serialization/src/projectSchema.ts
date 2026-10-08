import { z } from 'zod';

export const nodeTypeSchema = z.enum([
  'container',
  'rect',
  'circle',
  'path',
  'group',
  'ellipse',
  'line',
  'polyline',
  'image',
  'media',
  'video',
]);

// This schema defines only the properties we want to serialize.
// By default, z.object() will strip out any extra properties (like localMatrix, worldMatrix, isDirty).
export const sceneNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  parentId: z.string().nullable(),
  children: z.array(z.string()).optional(),
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
  src: z.string().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  assetId: z.string().optional(),
  startTime: z.number().optional(),
  mediaOffset: z.number().optional(),
  duration: z.number().optional(),
  volume: z.number().optional(),
  muted: z.boolean().optional(),
  loop: z.boolean().optional(),
  playing: z.boolean().optional(),
  currentTime: z.number().optional(),
  playbackRate: z.number().optional(),
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

export const assetSchema = z.object({
  id: z.string(),
  type: z.enum(['image', 'video']),
  name: z.string(),
  url: z.string().optional(),
});

export const projectDataSchema = z.object({
  scene: z.record(z.string(), sceneNodeSchema),
  animations: z.array(trackSchema),
  metadata: projectMetadataSchema,
  assets: z.record(z.string(), assetSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.assets) {
    for (const [nodeId, node] of Object.entries(data.scene)) {
      if (node.assetId && !data.assets[node.assetId]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Referenced asset '${node.assetId}' on node '${nodeId}' not found in assets registry`,
          path: ['scene', nodeId, 'assetId'],
        });
      }
    }
  }
});

export function validateAndSerializeProject(data: unknown): string {
  // Parses the data, throws an error if invalid, and strips unregistered keys
  const parsed = projectDataSchema.parse(data);
  return JSON.stringify(parsed, null, 2);
}
