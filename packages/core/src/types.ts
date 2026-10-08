import { z } from "zod";

export const CanvasSchema = z.object({
  width: z.number().positive().default(1080),
  height: z.number().positive().default(1080),
  fps: z.number().positive().default(30),
  duration: z.number().positive().default(4),
  background: z.string().optional().default("#0B1020"),
});

export type Canvas = z.infer<typeof CanvasSchema>;

export interface PresetRef {
  name: string;
  at?: number | undefined;
  duration?: number | undefined;
  params?: Record<string, unknown> | undefined;
}

export const PresetRefSchema: z.ZodType<PresetRef> = z.object({
  name: z.string(),
  at: z.number().optional(),
  duration: z.number().optional(),
  params: z.record(z.unknown()).optional(),
});

export interface Layer {
  id: string;
  name?: string | undefined;
  type?: "shape" | "text" | "image" | "group" | "lottie" | undefined;
  position?: [number, number] | undefined;
  anchor?: [number, number] | undefined;
  scale?: [number, number] | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  parent?: string | null | undefined;
  presets?: PresetRef[] | undefined;
  keyframes?: Record<string, unknown[]> | undefined;
  shape?: Record<string, unknown> | undefined;
  text?: string | undefined;
  font?: Record<string, unknown> | undefined;
  fill?: string | undefined;
  stroke?: Record<string, unknown> | undefined;
  asset?: string | undefined;
  size?: [number, number] | undefined;
  children?: Layer[] | undefined;
}

export const LayerSchema: z.ZodType<Layer> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z
      .enum(["shape", "text", "image", "group", "lottie"])
      .optional()
      .default("shape"),
    position: z.tuple([z.number(), z.number()]).optional().default([540, 540]),
    anchor: z.tuple([z.number(), z.number()]).optional(),
    scale: z.tuple([z.number(), z.number()]).optional().default([100, 100]),
    rotation: z.number().optional().default(0),
    opacity: z.number().min(0).max(100).optional().default(100),
    visible: z.boolean().optional().default(true),
    parent: z.string().nullable().optional(),
    presets: z.array(PresetRefSchema).optional(),
    keyframes: z.record(z.array(z.unknown())).optional().default({}),
    shape: z.record(z.unknown()).optional(),
    text: z.string().optional(),
    font: z.record(z.unknown()).optional(),
    fill: z.string().optional(),
    stroke: z.record(z.unknown()).optional(),
    asset: z.string().optional(),
    size: z.tuple([z.number(), z.number()]).optional(),
    children: z.array(LayerSchema).optional(),
  }),
);

export const AssetSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "svg", "video", "font", "lottie"]),
  src: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
  origin: z.record(z.unknown()).optional(),
});

export type Asset = z.infer<typeof AssetSchema>;

export const ParamSchema = z.object({
  type: z.enum(["color", "text", "number"]),
  value: z.union([z.string(), z.number()]),
  label: z.string().optional(),
});

export type Param = z.infer<typeof ParamSchema>;

export const VideoClipSchema = z.object({
  id: z.string(),
  asset: z.string(),
  at: z.number().default(0),
  trimIn: z.number().default(0),
  duration: z.number(),
  placement: z.enum(["under", "over"]).default("under"),
});

export type VideoClip = z.infer<typeof VideoClipSchema>;

export const MotionDocSchema = z.object({
  version: z.number().default(1),
  revision: z.number().default(0),
  name: z.string().default("Untitled"),
  canvas: CanvasSchema,
  params: z.record(ParamSchema).optional().default({}),
  assets: z.array(AssetSchema).optional().default([]),
  layers: z.array(LayerSchema).optional().default([]),
  videoTrack: z.array(VideoClipSchema).optional().default([]),
});

export type MotionDoc = z.infer<typeof MotionDocSchema>;

export type Op =
  | { op: "setCanvas"; set: Partial<Canvas> }
  | { op: "addLayer"; layer: Layer; parent?: string; index?: number }
  | { op: "updateLayer"; id: string; set: Partial<Layer> }
  | { op: "removeLayer"; id: string }
  | { op: "moveLayer"; id: string; parent?: string | null; index: number }
  | {
      op: "setKeyframes";
      id: string;
      prop: string;
      keyframes: unknown[] | null;
    }
  | { op: "addPreset"; id: string; preset: PresetRef }
  | { op: "removePreset"; id: string; index: number }
  | { op: "setParam"; name: string; param: Param | null }
  | { op: "addAsset"; asset: Asset }
  | { op: "removeAsset"; id: string }
  | { op: "setVideoTrack"; clips: VideoClip[] };

export interface ApplyOpsResult {
  doc: MotionDoc;
  revision: number;
  changedIds: string[];
  warnings: string[];
}
