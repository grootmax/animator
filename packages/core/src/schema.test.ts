import { describe, expect, it } from "vitest";
import { AnimatorError } from "./errors.js";
import {
  type MotionDoc,
  parseMotionDoc,
  validateHierarchy,
  validateMotionDoc,
} from "./schema.js";

describe("Motion Doc Schema & Layer Types", () => {
  const validDoc: MotionDoc = {
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
          model: "fast-sdxl",
          prompt: "rocket",
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
        type: "image",
        asset: "hero",
        position: [540, 540],
        size: [1080, 1080],
        opacity: 60,
        presets: [
          {
            name: "kenBurns",
            at: 0,
            duration: 4,
            params: { zoom: 1.08 },
          },
        ],
      },
      {
        id: "title",
        type: "text",
        text: "{{headline}}",
        font: { family: "Inter", weight: 800, size: 120 },
        fill: "{{accent}}",
        align: "center",
        position: [540, 480],
        presets: [
          { name: "fadeIn", at: 0.2, duration: 0.5 },
          { name: "slideUp", at: 0.2, duration: 0.6, params: { distance: 60 } },
          { name: "fadeOut", at: 3.4, duration: 0.4 },
        ],
      },
      {
        id: "underline",
        type: "shape",
        position: [540, 580],
        shape: { kind: "path", d: "M -200 0 L 200 0" },
        stroke: { color: "{{accent}}", width: 8, cap: "round" },
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
        type: "group",
        position: [540, 760],
        children: [
          {
            id: "pill",
            type: "shape",
            shape: { kind: "rect", size: [260, 72], radius: 36 },
            fill: "#FFFFFF",
          },
          {
            id: "pill-label",
            type: "text",
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
        placement: "under",
      },
    ],
  };

  it("parses and validates a full Motion Doc fixture from project context", () => {
    const doc = parseMotionDoc(validDoc);
    expect(doc.version).toBe(1);
    expect(doc.canvas.width).toBe(1080);
    expect(doc.layers.length).toBe(4);
    expect(doc.layers[0]?.type).toBe("image");
    expect(doc.layers[1]?.type).toBe("text");
    expect(doc.layers[2]?.type).toBe("shape");
    expect(doc.layers[3]?.type).toBe("group");
  });

  it("validates all 5 layer varieties correctly", () => {
    const allLayersDoc = {
      version: 1,
      canvas: { width: 800, height: 600, fps: 30, duration: 5 },
      layers: [
        {
          id: "rect-shape",
          type: "shape",
          shape: { kind: "rect", size: [100, 100], radius: [5, 5, 5, 5] },
          fill: "#FF0000",
        },
        {
          id: "ellipse-shape",
          type: "shape",
          shape: { kind: "ellipse", size: [80, 80] },
          gradient: {
            type: "linear",
            start: [0, 0],
            end: [80, 80],
            stops: [
              { offset: 0, color: "#FFFFFF" },
              { offset: 1, color: "#000000" },
            ],
          },
        },
        {
          id: "polygon-shape",
          type: "shape",
          shape: { kind: "polygon", points: 6, radius: 50 },
          trim: { start: 0, end: 50 },
        },
        {
          id: "star-shape",
          type: "shape",
          shape: { kind: "star", points: 5, innerRadius: 20, outerRadius: 40 },
        },
        {
          id: "text-layer",
          type: "text",
          text: "Hello World",
          font: { family: "Inter", size: 48 },
          align: "left",
          native: true,
        },
        {
          id: "image-layer",
          type: "image",
          asset: "my-asset",
          size: [200, 200],
          fit: "cover",
        },
        {
          id: "lottie-layer",
          type: "lottie",
          asset: "sub-animation",
          timeOffset: 0.5,
          speed: 1.5,
        },
        {
          id: "group-layer",
          type: "group",
          children: [
            {
              id: "child-path",
              type: "shape",
              shape: { kind: "path", d: "M 0 0 L 10 10" },
            },
          ],
        },
      ],
    };

    const doc = parseMotionDoc(allLayersDoc);
    expect(doc.layers.length).toBe(8);
  });

  it("rejects unknown or invalid fields with ERR_UNKNOWN_FIELD and exact path", () => {
    const invalidDoc = {
      ...validDoc,
      canvas: {
        ...validDoc.canvas,
        unrecognizedOption: true,
      },
    };

    expect(() => parseMotionDoc(invalidDoc)).toThrowError(AnimatorError);
    try {
      parseMotionDoc(invalidDoc);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_UNKNOWN_FIELD");
      expect(animErr.path).toBe("canvas.unrecognizedOption");
      expect(animErr.hint).toContain("Remove unrecognized property");
    }
  });

  it("rejects invalid canvas dimensions", () => {
    const badWidth = {
      ...validDoc,
      canvas: { ...validDoc.canvas, width: -100 },
    };
    expect(() => parseMotionDoc(badWidth)).toThrowError(AnimatorError);

    const badDuration = {
      ...validDoc,
      canvas: { ...validDoc.canvas, duration: 0 },
    };
    expect(() => parseMotionDoc(badDuration)).toThrowError(AnimatorError);
  });

  it("rejects undefined parameter references", () => {
    const docWithUndefinedParam = {
      ...validDoc,
      layers: [
        {
          id: "text-1",
          type: "text",
          text: "{{nonExistentParam}}",
        },
      ],
    };

    expect(() => parseMotionDoc(docWithUndefinedParam)).toThrowError(
      AnimatorError,
    );
    try {
      parseMotionDoc(docWithUndefinedParam);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_UNDEFINED_PARAM");
      expect(animErr.path).toBe("layers[0].text");
    }
  });

  it("rejects duplicate layer IDs", () => {
    const docWithDupes = {
      ...validDoc,
      layers: [
        {
          id: "layer-1",
          type: "shape",
          shape: { kind: "ellipse", size: [10, 10] },
        },
        {
          id: "layer-1",
          type: "shape",
          shape: { kind: "ellipse", size: [20, 20] },
        },
      ],
    };

    expect(() => parseMotionDoc(docWithDupes)).toThrowError(AnimatorError);
    try {
      parseMotionDoc(docWithDupes);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_DUPLICATE_LAYER_ID");
      expect(animErr.path).toBe("layers[1].id");
    }
  });

  it("rejects self-referential parent", () => {
    const docWithSelfParent = {
      ...validDoc,
      layers: [
        {
          id: "layer-self",
          type: "shape",
          shape: { kind: "ellipse", size: [10, 10] },
          parent: "layer-self",
        },
      ],
    };

    expect(() => parseMotionDoc(docWithSelfParent)).toThrowError(AnimatorError);
    try {
      parseMotionDoc(docWithSelfParent);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_SELF_REFERENCE");
      expect(animErr.path).toBe("layers[0].parent");
    }
  });

  it("rejects cyclic parent-child hierarchy", () => {
    const docWithCycle = {
      ...validDoc,
      layers: [
        {
          id: "layer-a",
          type: "shape",
          shape: { kind: "ellipse", size: [10, 10] },
          parent: "layer-b",
        },
        {
          id: "layer-b",
          type: "shape",
          shape: { kind: "ellipse", size: [10, 10] },
          parent: "layer-a",
        },
      ],
    };

    expect(() => parseMotionDoc(docWithCycle)).toThrowError(AnimatorError);
    try {
      parseMotionDoc(docWithCycle);
    } catch (err) {
      const animErr = err as AnimatorError;
      expect(animErr.code).toBe("ERR_HIERARCHY_CYCLE");
    }
  });

  it("rejects group containing itself as child", () => {
    expect(() =>
      validateHierarchy([
        {
          id: "group-1",
          type: "group",
          children: [
            {
              id: "group-1",
              type: "shape",
              shape: { kind: "ellipse", size: [10, 10] },
            },
          ],
        },
      ]),
    ).toThrowError(AnimatorError);
  });

  it("returns safe result with validateMotionDoc", () => {
    const goodResult = validateMotionDoc(validDoc);
    expect(goodResult.success).toBe(true);

    const badResult = validateMotionDoc({ invalid: "doc" });
    expect(badResult.success).toBe(false);
    if (!badResult.success) {
      expect(badResult.error).toBeInstanceOf(AnimatorError);
    }
  });
});
