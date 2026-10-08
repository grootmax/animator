import { describe, expect, test } from "vitest";
import { AnimatorError } from "./errors.js";
import {
  applyStagger,
  expandLayerPresets,
  expandPreset,
  getPresetTouchedProperties,
} from "./presets.js";
import type { LayerNode, PresetRef, StaggerConfig } from "./types.js";

describe("Preset Expansion Engine", () => {
  test("getPresetTouchedProperties returns correct properties for supported presets", () => {
    expect(getPresetTouchedProperties("fadeIn")).toEqual(["opacity"]);
    expect(getPresetTouchedProperties("fadeOut")).toEqual(["opacity"]);
    expect(getPresetTouchedProperties("slideUp")).toEqual(["position"]);
    expect(getPresetTouchedProperties("slideOutUp")).toEqual(["position"]);
    expect(getPresetTouchedProperties("pop")).toEqual(["scale"]);
    expect(getPresetTouchedProperties("pulse")).toEqual(["scale"]);
    expect(getPresetTouchedProperties("drawOn")).toEqual(["trim.end"]);
    expect(getPresetTouchedProperties("unknown")).toEqual([]);
  });

  describe("Entrance Presets", () => {
    test("expands fadeIn preset into opacity keyframes", () => {
      const preset: PresetRef = { name: "fadeIn", at: 0.2, duration: 0.5 };
      const tracks = expandPreset(preset);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("opacity");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 0.2, v: 0, ease: "easeOutCubic" },
        { t: 0.7, v: 100 },
      ]);
    });

    test("expands slideUp preset into position keyframes", () => {
      const preset: PresetRef = {
        name: "slideUp",
        at: 0.2,
        duration: 0.6,
        params: { distance: 60, basePosition: [540, 480] },
      };
      const tracks = expandPreset(preset);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("position");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 0.2, v: [540, 540], ease: "easeOutCubic" },
        { t: 0.8, v: [540, 480] },
      ]);
    });

    test("expands pop preset into scale keyframes", () => {
      const node: LayerNode = { id: "icon", scale: [100, 100] };
      const preset: PresetRef = { name: "pop", at: 0.5, duration: 0.4 };
      const tracks = expandPreset(preset, node);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("scale");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 0.5, v: [0, 0], ease: "easeOutBack" },
        { t: 0.9, v: [100, 100] },
      ]);
    });

    test("expands drawOn preset into trim.end keyframes", () => {
      const preset: PresetRef = { name: "drawOn", at: 0.6, duration: 0.7 };
      const tracks = expandPreset(preset);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("trim.end");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 0.6, v: 0, ease: "easeOutExpo" },
        { t: 1.3, v: 100 },
      ]);
    });
  });

  describe("Exit and Emphasis Presets", () => {
    test("expands fadeOut preset into opacity keyframes", () => {
      const preset: PresetRef = { name: "fadeOut", at: 3.4, duration: 0.4 };
      const tracks = expandPreset(preset);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("opacity");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 3.4, v: 100, ease: "easeInCubic" },
        { t: 3.8, v: 0 },
      ]);
    });

    test("expands slideOutUp preset into position keyframes", () => {
      const node: LayerNode = { id: "title", position: [540, 480] };
      const preset: PresetRef = {
        name: "slideOutUp",
        at: 3.0,
        duration: 0.5,
        params: { distance: 80 },
      };
      const tracks = expandPreset(preset, node);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("position");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 3.0, v: [540, 480], ease: "easeInCubic" },
        { t: 3.5, v: [540, 400] },
      ]);
    });

    test("expands pulse preset into scale keyframes", () => {
      const node: LayerNode = { id: "button", scale: [100, 100] };
      const preset: PresetRef = {
        name: "pulse",
        at: 1.0,
        duration: 0.6,
        params: { scale: 120 },
      };
      const tracks = expandPreset(preset, node);

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.property).toBe("scale");
      expect(tracks[0]?.keyframes).toEqual([
        { t: 1.0, v: [100, 100], ease: "easeInOutQuad" },
        { t: 1.3, v: [120, 120], ease: "easeInOutQuad" },
        { t: 1.6, v: [100, 100] },
      ]);
    });
  });

  describe("Error handling and Stagger Operations", () => {
    test("throws AnimatorError for unknown preset name", () => {
      const preset: PresetRef = { name: "invalidPreset", at: 0, duration: 1 };
      expect(() => expandPreset(preset)).toThrowError(AnimatorError);
      try {
        expandPreset(preset);
      } catch (err) {
        expect(err).toBeInstanceOf(AnimatorError);
        const animErr = err as AnimatorError;
        expect(animErr.code).toBe("UNKNOWN_PRESET");
        expect(animErr.hint).toBeDefined();
      }
    });

    test("throws AnimatorError for invalid preset duration", () => {
      const preset: PresetRef = { name: "fadeIn", at: 0, duration: 0 };
      expect(() => expandPreset(preset)).toThrowError(AnimatorError);
    });

    test("computes offset delays correctly in multi-node stagger operations", () => {
      const stagger: StaggerConfig = {
        name: "stagger",
        targets: ["card1", "card2", "card3"],
        preset: "slideUp",
        at: 0.3,
        step: 0.08,
        duration: 0.5,
        params: { distance: 50 },
      };

      const nodes: LayerNode[] = [
        { id: "card1" },
        { id: "card2" },
        { id: "card3" },
      ];

      const result = applyStagger(stagger, nodes);

      expect(result.presetMap.get("card1")).toEqual({
        name: "slideUp",
        at: 0.3,
        duration: 0.5,
        params: { distance: 50 },
      });
      expect(result.presetMap.get("card2")).toEqual({
        name: "slideUp",
        at: 0.38,
        duration: 0.5,
        params: { distance: 50 },
      });
      expect(result.presetMap.get("card3")).toEqual({
        name: "slideUp",
        at: 0.46,
        duration: 0.5,
        params: { distance: 50 },
      });

      expect(result.updatedNodes).toBeDefined();
      expect(result.updatedNodes?.[0]?.presets).toEqual([
        { name: "slideUp", at: 0.3, duration: 0.5, params: { distance: 50 } },
      ]);
      expect(result.updatedNodes?.[1]?.presets).toEqual([
        { name: "slideUp", at: 0.38, duration: 0.5, params: { distance: 50 } },
      ]);
      expect(result.updatedNodes?.[2]?.presets).toEqual([
        { name: "slideUp", at: 0.46, duration: 0.5, params: { distance: 50 } },
      ]);
    });

    test("expandLayerPresets expands multiple non-conflicting presets on a single node", () => {
      const node: LayerNode = {
        id: "title",
        position: [540, 480],
        opacity: 100,
        presets: [
          { name: "fadeIn", at: 0.2, duration: 0.5 },
          { name: "slideUp", at: 0.2, duration: 0.6, params: { distance: 60 } },
          { name: "fadeOut", at: 3.4, duration: 0.4 },
        ],
      };

      const tracks = expandLayerPresets(node);

      expect(tracks.opacity).toEqual([
        { t: 0.2, v: 0, ease: "easeOutCubic" },
        { t: 0.7, v: 100 },
        { t: 3.4, v: 100, ease: "easeInCubic" },
        { t: 3.8, v: 0 },
      ]);

      expect(tracks.position).toEqual([
        { t: 0.2, v: [540, 540], ease: "easeOutCubic" },
        { t: 0.8, v: [540, 480] },
      ]);
    });
  });
});
