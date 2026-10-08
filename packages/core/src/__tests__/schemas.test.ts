import { describe, expect, it } from "vitest";
import {
  AssetSchema,
  CanvasSchema,
  GroupLayerSchema,
  KeyframeSchema,
  LayerSchema,
  MotionDocSchema,
  OpSchema,
  ParamSchema,
  ParamsSchema,
  PresetRefSchema,
  ShapeLayerSchema,
  TextLayerSchema,
} from "../index.js";

describe("Motion Doc Schemas", () => {
  it("validates CanvasSchema correctly", () => {
    const validCanvas = {
      width: 1080,
      height: 1080,
      fps: 30,
      duration: 4,
      background: "#0B1020",
    };
    expect(CanvasSchema.parse(validCanvas)).toEqual(validCanvas);

    expect(() =>
      CanvasSchema.parse({ width: -100, height: 1080, fps: 30, duration: 4 }),
    ).toThrow();
  });

  it("validates ParamSchema and ParamsSchema", () => {
    const colorParam = { type: "color", value: "#FF5A5F", label: "Accent" };
    const textParam = { type: "text", value: "Ship faster", label: "Headline" };
    const numberParam = { type: "number", value: 42, label: "Count" };

    expect(ParamSchema.parse(colorParam)).toEqual(colorParam);
    expect(ParamSchema.parse(textParam)).toEqual(textParam);
    expect(ParamSchema.parse(numberParam)).toEqual(numberParam);

    const paramsMap = {
      accent: colorParam,
      headline: textParam,
    };
    expect(ParamsSchema.parse(paramsMap)).toEqual(paramsMap);
  });

  it("validates AssetSchema", () => {
    const asset = {
      id: "hero",
      type: "image" as const,
      src: "assets/hero.png",
      width: 1024,
      height: 1024,
      origin: {
        kind: "generated",
        provider: "fal",
        prompt: "A cool hero illustration",
      },
    };
    expect(AssetSchema.parse(asset)).toEqual(asset);
  });

  it("validates KeyframeSchema", () => {
    const kf1 = { t: 0, v: [0, 0] };
    const kf2 = { t: 1, v: [100, 100], ease: "easeOutBack" };
    const kf3 = {
      t: 2,
      v: 50,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    };

    expect(KeyframeSchema.parse(kf1)).toEqual(kf1);
    expect(KeyframeSchema.parse(kf2)).toEqual(kf2);
    expect(KeyframeSchema.parse(kf3)).toEqual(kf3);
  });

  it("validates PresetRefSchema", () => {
    const preset = {
      name: "slideUp",
      at: 0.2,
      duration: 0.6,
      params: { distance: 60 },
    };
    expect(PresetRefSchema.parse(preset)).toEqual(preset);
  });

  it("validates LayerSchema for various layer types including nested groups", () => {
    const shapeLayer = {
      id: "rect1",
      type: "shape" as const,
      position: [540, 540] as [number, number],
      shape: {
        kind: "rect" as const,
        size: [200, 200] as [number, number],
        radius: 10,
      },
      fill: "#FF0000",
      stroke: { color: "#000000", width: 2 },
    };

    const textLayer = {
      id: "title",
      type: "text" as const,
      text: "Hello World",
      font: { family: "Inter", size: 48, weight: 700 },
      fill: "#FFFFFF",
      align: "center" as const,
    };

    const groupLayer = {
      id: "group1",
      type: "group" as const,
      position: [540, 540] as [number, number],
      children: [shapeLayer, textLayer],
    };

    expect(ShapeLayerSchema.parse(shapeLayer)).toEqual(shapeLayer);
    expect(TextLayerSchema.parse(textLayer)).toEqual(textLayer);
    expect(GroupLayerSchema.parse(groupLayer)).toEqual(groupLayer);
    expect(LayerSchema.parse(groupLayer)).toEqual(groupLayer);
  });

  it("validates a complete MotionDocSchema document", () => {
    const doc = {
      version: 1 as const,
      name: "Test Project",
      canvas: {
        width: 1080,
        height: 1080,
        fps: 30,
        duration: 4,
        background: "#0B1020",
      },
      params: {
        accent: { type: "color" as const, value: "#FF5A5F", label: "Accent" },
      },
      assets: [
        {
          id: "hero",
          type: "image" as const,
          src: "assets/hero.png",
          width: 500,
          height: 500,
        },
      ],
      layers: [
        {
          id: "layer1",
          type: "shape" as const,
          position: [100, 100] as [number, number],
          shape: {
            kind: "ellipse" as const,
            size: [50, 50] as [number, number],
          },
          fill: "#00FF00",
        },
      ],
    };

    expect(MotionDocSchema.parse(doc)).toEqual(doc);
  });

  it("rejects malformed operation objects and invalid nodes", () => {
    expect(() => OpSchema.parse({ op: "invalidOp" })).toThrow();
    expect(() => OpSchema.parse({ op: "addLayer" })).toThrow();
    expect(() => OpSchema.parse({ op: "updateLayer", id: 123 })).toThrow();
  });
});
