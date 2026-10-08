import { z } from "zod";

export const AssetOriginSchema = z.object({
  kind: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
});

export const AssetSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "video", "svg", "lottie", "font"]),
  src: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
  origin: AssetOriginSchema.optional(),
});

export const AssetsSchema = z.array(AssetSchema);

export type AssetOrigin = z.infer<typeof AssetOriginSchema>;
export type Asset = z.infer<typeof AssetSchema>;
