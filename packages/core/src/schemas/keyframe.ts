import { z } from "zod";

export const BezierEaseSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const EaseSchema = z.union([z.string(), BezierEaseSchema]);

export const KeyframeSchema = z.object({
  t: z.number(),
  v: z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.array(z.number()),
    z.record(z.string(), z.unknown()),
  ]),
  ease: EaseSchema.optional(),
});

export const KeyframesSchema = z.array(KeyframeSchema);

export type Keyframe = z.infer<typeof KeyframeSchema>;
