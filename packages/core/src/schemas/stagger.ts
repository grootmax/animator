import { z } from "zod";

export const StaggerSchema = z.object({
  id: z.string(),
  targets: z.array(z.string()),
  preset: z.string(),
  at: z.number(),
  step: z.number(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type Stagger = z.infer<typeof StaggerSchema>;
