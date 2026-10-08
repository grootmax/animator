import { z } from "zod";

export const VideoClipSchema = z.object({
  id: z.string(),
  asset: z.string(),
  at: z.number(),
  trimIn: z.number().optional(),
  duration: z.number(),
  placement: z.enum(["under", "over"]).optional(),
});

export const VideoTrackSchema = z.array(VideoClipSchema);

export type VideoClip = z.infer<typeof VideoClipSchema>;
export type VideoTrack = z.infer<typeof VideoTrackSchema>;
