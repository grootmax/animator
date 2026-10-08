import { z } from "zod";

export const CORE_VERSION = "0.0.0";

export const nodeTypeSchema = z.enum(["image", "shape", "group", "text"]);
export type NodeType = z.infer<typeof nodeTypeSchema>;

export type SceneNode = {
  id: string;
  type: NodeType;
  name?: string | undefined;
  src?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  children?: SceneNode[] | undefined;
};

export const sceneNodeSchema: z.ZodType<SceneNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: nodeTypeSchema,
    name: z.string().optional(),
    src: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    opacity: z.number().optional(),
    visible: z.boolean().optional(),
    children: z.array(sceneNodeSchema).optional(),
  }),
);

export function serializeSceneNode(node: SceneNode): string {
  const validated = sceneNodeSchema.parse(node);
  return JSON.stringify(validated);
}

export function deserializeSceneNode(json: string): SceneNode {
  const parsed = JSON.parse(json);
  return sceneNodeSchema.parse(parsed);
}
