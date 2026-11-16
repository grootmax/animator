import { describe, expect, it } from "vitest";
import { AnimatorError } from "./errors.js";
import {
  AssetSchema,
  CanvasSchema,
  KeyframeSchema,
  LayerSchema,
  MotionDocSchema,
  ParamSchema,
  PresetRefSchema,
  StaggerSchema,
  VideoClipSchema,
  parseMotionDoc,
} from "./schema.js";

describe("Motion Doc Schemas", () => {
  describe("CanvasSchema", () => {
    it("validates valid canvas", () => {
      const valid = {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 5,
        background: "#000000",
      };
      expect(CanvasSchema.parse(valid)).toEqual(valid);
    });

    it("rejects non-positive dimensions", () => {
      expect(() =>
        CanvasSchema.parse({ width: -10, height: 100, fps: 30, duration: 2 }),
      ).toThrow();
      expect(() =>
        CanvasSchema.parse({ width: 100, height: 0, fps: 30, duration: 2 }),
      ).toThrow();
      expect(() =>
        CanvasSchema.parse({ width: 100, height: 100, fps: 0, duration: 2 }),
      ).toThrow();
      expect(() =>
        CanvasSchema.parse({ width: 100, height: 100, fps: 30, duration: -1 }),
      ).toThrow();
    });
  });

  describe("ParamSchema", () => {
    it("validates color, text, and number params", () => {
      expect(
        ParamSchema.parse({ type: "color", value: "#FF5A5F", label: "Accent" }),
      ).toBeDefined();
      expect(
        ParamSchema.parse({ type: "text", value: "Hello world" }),
      ).toBeDefined();
      expect(ParamSchema.parse({ type: "number", value: 42 })).toBeDefined();
    });
  });

  describe("AssetSchema", () => {
    it("validates image and video assets with origin", () => {
      const imageAsset = {
        id: "hero-img",
        type: "image",
        src: "assets/hero.png",
        width: 1024,
        height: 1024,
        origin: {
          kind: "generated",
          provider: "fal",
          model: "fast-sdxl",
          prompt: "A rocket",
        },
      };
      expect(AssetSchema.parse(imageAsset)).toEqual(imageAsset);
    });
  });

  describe("KeyframeSchema & PresetRefSchema", () => {
    it("validates keyframes with named easing or bezier array", () => {
      expect(
        KeyframeSchema.parse({ t: 0, v: [0, 0], ease: "easeOutBack" }),
      ).toBeDefined();
      expect(
        KeyframeSchema.parse({ t: 1.5, v: 100, ease: [0.25, 0.1, 0.25, 1] }),
      ).toBeDefined();
    });

    it("validates preset references", () => {
      const preset = {
        name: "fadeIn",
        at: 0.5,
        duration: 0.8,
        params: { distance: 50 },
      };
      expect(PresetRefSchema.parse(preset)).toEqual(preset);
    });
  });

  describe("StaggerSchema & VideoClipSchema", () => {
    it("validates stagger definitions", () => {
      const stagger = {
        targets: ["layer1", "layer2", "layer3"],
        preset: "slideUp",
        at: 0.2,
        step: 0.08,
      };
      expect(StaggerSchema.parse(stagger)).toEqual(stagger);
    });

    it("validates video clips", () => {
      const clip = {
        id: "clip-1",
        asset: "bg-video",
        at: 0,
        trimIn: 0.5,
        duration: 4,
        placement: "under" as const,
      };
      expect(VideoClipSchema.parse(clip)).toEqual(clip);
    });
  });

  describe("LayerSchema", () => {
    it("validates shape layer", () => {
      const shapeLayer = {
        id: "rect-1",
        type: "shape" as const,
        shape: { kind: "rect" as const, size: [200, 100], radius: 10 },
        fill: "#FF0000",
        stroke: { color: "#FFFFFF", width: 2 },
      };
      expect(LayerSchema.parse(shapeLayer)).toBeDefined();
    });

    it("validates text layer", () => {
      const textLayer = {
        id: "title-1",
        type: "text" as const,
        text: "Sample Title",
        font: { family: "Inter", size: 48, weight: 700 },
        fill: "#333333",
        align: "center" as const,
      };
      expect(LayerSchema.parse(textLayer)).toBeDefined();
    });

    it("validates group layer with nested children", () => {
      const groupLayer = {
        id: "group-1",
        type: "group" as const,
        children: [
          {
            id: "child-rect",
            type: "shape" as const,
            shape: { kind: "ellipse" as const, size: [50, 50] },
          },
        ],
      };
      expect(LayerSchema.parse(groupLayer)).toBeDefined();
    });
  });

  describe("MotionDocSchema & PROJECT_CONTEXT §7.1 fixture", () => {
    it("validates the full PROJECT_CONTEXT §7.1 specification example document", () => {
      const doc = {
        version: 1,
        name: "Launch title",
        canvas: {
          width: 1080,
          height: 1080,
          fps: 30,
          duration: 4,
          background: "#0B1020",
        },
        params: {
          accent: { type: "color", value: "#FF5A5F", label: "Accent" },
          headline: { type: "text", value: "Ship faster", label: "Headline" },
        },
        assets: [
          {
            id: "hero",
            type: "image",
            src: "assets/hero.png",
            width: 1024,
            height: 1024,
            origin: {
              kind: "generated",
              provider: "fal",
              model: "…",
              prompt: "…",
            },
          },
          {
            id: "bg-video",
            type: "video",
            src: "assets/bg.mp4",
            width: 1080,
            height: 1080,
            durationSec: 6,
          },
        ],
        layers: [
          {
            id: "bg-image",
            type: "image" as const,
            asset: "hero",
            position: [540, 540],
            size: [1080, 1080],
            opacity: 60,
            presets: [
              { name: "kenBurns", at: 0, duration: 4, params: { zoom: 1.08 } },
            ],
          },
          {
            id: "title",
            type: "text" as const,
            text: "{{headline}}",
            font: { family: "Inter", weight: 800, size: 120 },
            fill: "{{accent}}",
            align: "center" as const,
            position: [540, 480],
            presets: [
              { name: "fadeIn", at: 0.2, duration: 0.5 },
              {
                name: "slideUp",
                at: 0.2,
                duration: 0.6,
                params: { distance: 60 },
              },
              { name: "fadeOut", at: 3.4, duration: 0.4 },
            ],
          },
          {
            id: "underline",
            type: "shape" as const,
            position: [540, 580],
            shape: { kind: "path" as const, d: "M -200 0 L 200 0" },
            stroke: { color: "{{accent}}", width: 8, cap: "round" as const },
            presets: [
              {
                name: "drawOn",
                at: 0.6,
                duration: 0.7,
                params: { ease: "easeOutExpo" },
              },
            ],
          },
          {
            id: "badge",
            type: "group" as const,
            position: [540, 760],
            children: [
              {
                id: "pill",
                type: "shape" as const,
                shape: { kind: "rect" as const, size: [260, 72], radius: 36 },
                fill: "#FFFFFF",
              },
              {
                id: "pill-label",
                type: "text" as const,
                text: "v2.0",
                font: { family: "Inter", weight: 600, size: 36 },
                fill: "#0B1020",
              },
            ],
            keyframes: {
              scale: [
                { t: 0.9, v: [0, 0] },
                { t: 1.3, v: [100, 100], ease: "easeOutBack" },
              ],
            },
          },
        ],
        videoTrack: [
          {
            id: "clip1",
            asset: "bg-video",
            at: 0,
            trimIn: 0,
            duration: 4,
            placement: "under" as const,
          },
        ],
      };

      const parsed = MotionDocSchema.parse(doc);
      expect(parsed.name).toBe("Launch title");
      expect(parsed.layers.length).toBe(4);
    });

    it("throws AnimatorError with diagnostics in parseMotionDoc", () => {
      const invalid = { version: 1, name: "Broken", canvas: { width: -50 } };
      expect(() => parseMotionDoc(invalid)).toThrowError(AnimatorError);
      try {
        parseMotionDoc(invalid);
      } catch (err) {
        expect(err).toBeInstanceOf(AnimatorError);
        const animatorError = err as AnimatorError;
        expect(animatorError.code).toBe("SCHEMA_VALIDATION_ERROR");
        expect(animatorError.path).toBeDefined();
        expect(animatorError.metadata).toBeDefined();
      }
    });
  });
});
