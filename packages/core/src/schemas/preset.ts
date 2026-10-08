import { z } from "zod";

export const PresetRefSchema = z.object({
  name: z.string(),
  at: z.number(),
  duration: z.number(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const PresetsSchema = z.array(PresetRefSchema);

export type PresetRef = z.infer<typeof PresetRefSchema>;
