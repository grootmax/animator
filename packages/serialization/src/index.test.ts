import { describe, expect, it } from "vitest";
import {
  type ProjectData,
  compileProjectToLottie,
  validateLottieSchema,
} from "./index.js";

describe("@monorepo/serialization pipeline", () => {
  it("compiles shape, text, image, and group layers into valid Lottie layer types (ty:4, ty:5, ty:2, ty:0)", () => {
    const sampleProject: ProjectData = {
      version: 1,
      name: "Full Feature Animation",
      canvas: {
        width: 1080,
        height: 1080,
        fps: 30,
        duration: 4,
        background: "#0B1020",
      },
      assets: [
        {
          id: "hero-asset",
          type: "image",
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          width: 1024,
          height: 1024,
        },
      ],
      layers: [
        {
          id: "rect-layer",
          name: "Vector Rectangle",
          type: "shape",
          shape: { kind: "rect", size: [400, 200], radius: 20 },
          fill: "#FF5A5F",
          stroke: { color: "#FFFFFF", width: 4 },
          position: [540, 540],
        },
        {
          id: "image-layer",
          name: "Hero Image",
          type: "image",
          asset: "hero-asset",
          position: [540, 300],
        },
        {
          id: "text-layer",
          name: "Title Text",
          type: "text",
          text: "Hello Lottie",
          font: { family: "Inter", size: 64, weight: 700 },
          fill: "#00FFDD",
          align: "center",
          position: [540, 800],
        },
        {
          id: "group-layer",
          name: "Card Group",
          type: "group",
          position: [540, 600],
          children: [
            {
              id: "child-circle",
              type: "circle",
              shape: { kind: "circle", size: [100, 100] },
              fill: "#123456",
            },
          ],
        },
      ],
    };

    const lottieJsonStr = compileProjectToLottie(sampleProject, {
      prettify: true,
    });
    expect(lottieJsonStr).toBeTypeOf("string");

    const lottieObj = JSON.parse(lottieJsonStr);
    expect(lottieObj.v).toBe("5.7.0");
    expect(lottieObj.fr).toBe(30);
    expect(lottieObj.op).toBe(120);
    expect(lottieObj.w).toBe(1080);
    expect(lottieObj.h).toBe(1080);

    // Verify Lottie layer types
    const layers = lottieObj.layers;
    expect(layers.length).toBe(4);

    // Check layer type matching (remember Lottie layer order is reversed from Motion Doc)
    // Motion Doc order: [rect, image, text, group]
    // Lottie order: [group (ty:0), text (ty:5), image (ty:2), rect (ty:4)]
    const groupLottieLayer = layers.find(
      (l: Record<string, unknown>) => l.nm === "Card Group",
    );
    expect(groupLottieLayer).toBeDefined();
    expect(groupLottieLayer.ty).toBe(0);

    const textLottieLayer = layers.find(
      (l: Record<string, unknown>) => l.nm === "Title Text",
    );
    expect(textLottieLayer).toBeDefined();
    expect(textLottieLayer.ty).toBe(5);

    const imageLottieLayer = layers.find(
      (l: Record<string, unknown>) => l.nm === "Hero Image",
    );
    expect(imageLottieLayer).toBeDefined();
    expect(imageLottieLayer.ty).toBe(2);

    const rectLottieLayer = layers.find(
      (l: Record<string, unknown>) => l.nm === "Vector Rectangle",
    );
    expect(rectLottieLayer).toBeDefined();
    expect(rectLottieLayer.ty).toBe(4);

    // Validate Lottie JSON schema using Ajv validator
    const validation = validateLottieSchema(lottieJsonStr);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("accurately maps position, rotation, scale, opacity tracks and keyframes with easing", () => {
    const animatedProject: ProjectData = {
      canvas: { width: 800, height: 600, fps: 60, duration: 2 },
      layers: [
        {
          id: "anim-rect",
          type: "rect",
          shape: { kind: "rect", size: [100, 100] },
          fill: "#FF0000",
          keyframes: {
            position: [
              { t: 0, v: [0, 0], ease: "easeOutCubic" },
              { t: 1, v: [400, 300], ease: "hold" },
              { t: 2, v: [800, 600] },
            ],
            scale: [
              { t: 0, v: [100, 100], ease: "easeInQuad" },
              { t: 2, v: [200, 200] },
            ],
            rotation: [
              { t: 0, v: 0, ease: "linear" },
              { t: 2, v: 360 },
            ],
            opacity: [
              { t: 0, v: 0, ease: "easeOutExpo" },
              { t: 2, v: 100 },
            ],
          },
        },
      ],
    };

    const lottieJson = compileProjectToLottie(animatedProject);
    const validation = validateLottieSchema(lottieJson);
    expect(validation.valid).toBe(true);

    const parsed = JSON.parse(lottieJson);
    const layer = parsed.layers[0];
    expect(layer.ks.p.a).toBe(1); // Animated position
    expect(layer.ks.p.k).toHaveLength(3);
    expect(layer.ks.p.k[0].t).toBe(0);
    expect(layer.ks.p.k[0].s).toEqual([0, 0]);
    expect(layer.ks.p.k[0].e).toEqual([400, 300]);
    expect(layer.ks.p.k[0].o).toBeDefined();
    expect(layer.ks.p.k[0].i).toBeDefined();

    expect(layer.ks.p.k[1].h).toBe(1); // Hold keyframe

    expect(layer.ks.s.a).toBe(1); // Animated scale
    expect(layer.ks.r.a).toBe(1); // Animated rotation
    expect(layer.ks.o.a).toBe(1); // Animated opacity
  });

  it("catches schema errors on non-compliant Lottie JSON", () => {
    const invalidJson = {
      v: "5.7.0",
      // missing fr, ip, op, w, h, layers
    };

    const result = validateLottieSchema(invalidJson);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("required");
  });

  it("meets performance requirements (< 50ms for 100 layers and 1,000 keyframes)", () => {
    const largeLayers: ProjectData["layers"] = [];
    for (let i = 0; i < 100; i++) {
      const kfTrack = [];
      for (let k = 0; k < 10; k++) {
        kfTrack.push({
          t: k * 0.2,
          v: [k * 10, k * 10] as [number, number],
          ease: "easeOutCubic" as const,
        });
      }
      largeLayers.push({
        id: `layer-${i}`,
        type: "rect",
        shape: { kind: "rect", size: [50, 50] },
        fill: "#0088FF",
        position: [i * 5, i * 5],
        keyframes: {
          position: kfTrack,
        },
      });
    }

    const largeProject: ProjectData = {
      canvas: { width: 1920, height: 1080, fps: 30, duration: 2 },
      layers: largeLayers,
    };

    const start = performance.now();
    const compiled = compileProjectToLottie(largeProject);
    const validation = validateLottieSchema(compiled);
    const duration = performance.now() - start;

    expect(validation.valid).toBe(true);
    expect(duration).toBeLessThan(50); // Under 50ms requirement
  });
});
