import { z } from "zod";

export const ColorParamSchema = z.object({
  type: z.literal("color"),
  value: z.string(),
  label: z.string(),
});

export const TextParamSchema = z.object({
  type: z.literal("text"),
  value: z.string(),
  label: z.string(),
});

export const NumberParamSchema = z.object({
  type: z.literal("number"),
  value: z.number(),
  label: z.string(),
});

export const ParamSchema = z.discriminatedUnion("type", [
  ColorParamSchema,
  TextParamSchema,
  NumberParamSchema,
]);

export const ParamsSchema = z.record(z.string(), ParamSchema);

export type Param = z.infer<typeof ParamSchema>;
export type Params = z.infer<typeof ParamsSchema>;
