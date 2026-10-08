import { z } from "zod";
import { AssetsSchema } from "./asset.js";
import { CanvasSchema } from "./canvas.js";
import { LayersSchema } from "./layer.js";
import { ParamsSchema } from "./param.js";
import { StaggerSchema } from "./stagger.js";
import { VideoTrackSchema } from "./video.js";

export const MotionDocSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  canvas: CanvasSchema,
  params: ParamsSchema.optional(),
  assets: AssetsSchema.optional(),
  layers: LayersSchema,
  videoTrack: VideoTrackSchema.optional(),
  staggers: z.array(StaggerSchema).optional(),
});

export type MotionDoc = z.infer<typeof MotionDocSchema>;
