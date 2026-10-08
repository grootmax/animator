import { z } from "zod";

export const CanvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  fps: z.number().positive(),
  duration: z.number().positive(),
  background: z.string().optional(),
});

export type Canvas = z.infer<typeof CanvasSchema>;
