import type { AnimatorError } from "./errors.js";

export type AnimProp =
  | "position"
  | "scale"
  | "rotation"
  | "opacity"
  | "anchor"
  | "fill"
  | "stroke.color"
  | "stroke.width"
  | "trim.start"
  | "trim.end"
  | "trim.offset"
  | "shape.size"
  | "shape.radius"
  | "shape.d";

export type EaseName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInExpo"
  | "easeOutExpo"
  | "easeOutBack"
  | "easeInOutQuad"
  | "spring"
  | "hold"
  | [number, number, number, number];

export interface Keyframe<T = unknown> {
  t: number;
  v: T;
  ease?: EaseName;
}

export type PresetName =
  | "fadeIn"
  | "slideUp"
  | "pop"
  | "drawOn"
  | "fadeOut"
  | "slideOutUp"
  | "pulse"
  | string;

export interface PresetRef {
  name: PresetName;
  at: number;
  duration: number;
  params?: Record<string, unknown>;
}

export interface StaggerConfig {
  name: "stagger";
  targets: string[];
  preset: PresetName | PresetRef;
  at: number;
  step: number;
  duration?: number;
  params?: Record<string, unknown>;
}

export interface PropertyTrack {
  property: AnimProp;
  keyframes: Keyframe[];
}

export interface LayerNode {
  id: string;
  type?: string;
  position?: [number, number];
  scale?: [number, number];
  opacity?: number;
  presets?: PresetRef[];
  keyframes?: Partial<Record<AnimProp, Keyframe[]>>;
  [key: string]: unknown;
}

export interface OverlapCollision {
  nodeId: string;
  property: AnimProp;
  overlapWindow: { start: number; end: number };
  presetA: { name: string; range: { start: number; end: number } };
  presetB: { name: string; range: { start: number; end: number } };
  message: string;
  hint: string;
}

export interface ValidationResult {
  valid: boolean;
  collisions: OverlapCollision[];
  errors: AnimatorError[];
}
