import { z } from "zod";
import { AssetSchema } from "./asset.js";
import { CanvasSchema } from "./canvas.js";
import { KeyframeSchema } from "./keyframe.js";
import { LayerSchema } from "./layer.js";
import { ParamSchema } from "./param.js";
import { PresetRefSchema } from "./preset.js";
import { StaggerSchema } from "./stagger.js";
import { VideoClipSchema } from "./video.js";

export const SetCanvasOpSchema = z.object({
  op: z.literal("setCanvas"),
  set: CanvasSchema.partial(),
});

export const AddLayerOpSchema = z.object({
  op: z.literal("addLayer"),
  layer: LayerSchema,
  parent: z.string().optional(),
  index: z.number().optional(),
});

export const UpdateLayerOpSchema = z.object({
  op: z.literal("updateLayer"),
  id: z.string(),
  set: z.record(z.string(), z.unknown()),
});

export const RemoveLayerOpSchema = z.object({
  op: z.literal("removeLayer"),
  id: z.string(),
});

export const MoveLayerOpSchema = z.object({
  op: z.literal("moveLayer"),
  id: z.string(),
  parent: z.string().nullable().optional(),
  index: z.number(),
});

export const SetKeyframesOpSchema = z.object({
  op: z.literal("setKeyframes"),
  id: z.string(),
  prop: z.string(),
  keyframes: z.array(KeyframeSchema).nullable(),
});

export const AddPresetOpSchema = z.object({
  op: z.literal("addPreset"),
  id: z.string(),
  preset: PresetRefSchema,
});

export const RemovePresetOpSchema = z.object({
  op: z.literal("removePreset"),
  id: z.string(),
  index: z.number(),
});

export const AddStaggerOpSchema = z.object({
  op: z.literal("addStagger"),
  stagger: StaggerSchema,
});

export const SetParamOpSchema = z.object({
  op: z.literal("setParam"),
  name: z.string(),
  param: ParamSchema.nullable(),
});

export const AddAssetOpSchema = z.object({
  op: z.literal("addAsset"),
  asset: AssetSchema,
});

export const RemoveAssetOpSchema = z.object({
  op: z.literal("removeAsset"),
  id: z.string(),
});

export const SetVideoTrackOpSchema = z.object({
  op: z.literal("setVideoTrack"),
  clips: z.array(VideoClipSchema),
});

export const OpSchema = z.discriminatedUnion("op", [
  SetCanvasOpSchema,
  AddLayerOpSchema,
  UpdateLayerOpSchema,
  RemoveLayerOpSchema,
  MoveLayerOpSchema,
  SetKeyframesOpSchema,
  AddPresetOpSchema,
  RemovePresetOpSchema,
  AddStaggerOpSchema,
  SetParamOpSchema,
  AddAssetOpSchema,
  RemoveAssetOpSchema,
  SetVideoTrackOpSchema,
]);

export const OpsSchema = z.array(OpSchema);

export type Op = z.infer<typeof OpSchema>;
