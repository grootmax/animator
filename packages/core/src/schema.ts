import { z } from "zod";

export type NodeType =
  | "container"
  | "rect"
  | "circle"
  | "path"
  | "group"
  | "ellipse"
  | "line"
  | "polyline"
  | "image"
  | "media"
  | "video";

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId?: string | null | undefined;
  children?: string[] | undefined;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  src?: string | undefined;
  mediaType?: "image" | "video" | undefined;
  assetId?: string | undefined;
  startTime?: number | undefined;
  mediaOffset?: number | undefined;
  duration?: number | undefined;
  volume?: number | undefined;
  muted?: boolean | undefined;
  loop?: boolean | undefined;
  playing?: boolean | undefined;
  currentTime?: number | undefined;
  playbackRate?: number | undefined;
}

export const nodeTypeSchema = z.enum([
  "container",
  "rect",
  "circle",
  "path",
  "group",
  "ellipse",
  "line",
  "polyline",
  "image",
  "media",
  "video",
]);

export const sceneNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  parentId: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  opacity: z.number(),
  visible: z.boolean(),
  locked: z.boolean(),
  src: z.string().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
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

export const assetSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "video"]),
  name: z.string(),
  url: z.string().optional(),
});

export const projectDataSchema = z
  .object({
    scene: z.record(z.string(), sceneNodeSchema),
    metadata: z.object({
      version: z.string(),
      duration: z.number(),
    }),
    assets: z.record(z.string(), assetSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.assets) {
      for (const [nodeId, node] of Object.entries(data.scene)) {
        if (node.assetId && !data.assets[node.assetId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Referenced asset '${node.assetId}' on node '${nodeId}' not found in assets registry`,
            path: ["scene", nodeId, "assetId"],
          });
        }
      }
    }
  });

export function validateAndSerializeProject(data: unknown): string {
  const result = projectDataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid project data: ${result.error.message}`);
  }
  return JSON.stringify(result.data);
}
