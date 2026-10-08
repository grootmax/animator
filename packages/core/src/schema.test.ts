import { describe, expect, it } from "vitest";
import { validateAndSerializeProject } from "./schema.js";

describe("validateAndSerializeProject", () => {
  it("should successfully validate video nodes with timing and asset properties", () => {
    const videoProject = {
      scene: {
        vnode1: {
          id: "vnode1",
          name: "Video Clip",
          type: "video",
          parentId: null,
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          assetId: "asset_123",
          startTime: 1000,
          mediaOffset: 500,
          duration: 3000,
          volume: 0.8,
          muted: false,
          loop: true,
        },
      },
      metadata: {
        version: "1.0.0",
        duration: 10000,
      },
      assets: {
        asset_123: {
          id: "asset_123",
          type: "video",
          name: "sample.mp4",
        },
      },
    };

    const serialized = validateAndSerializeProject(videoProject);
    const parsed = JSON.parse(serialized);
    expect(parsed.scene.vnode1.type).toBe("video");
    expect(parsed.scene.vnode1.assetId).toBe("asset_123");
    expect(parsed.scene.vnode1.startTime).toBe(1000);
    expect(parsed.scene.vnode1.volume).toBe(0.8);
    expect(parsed.scene.vnode1.loop).toBe(true);
  });

  it("should throw when video node references missing assetId", () => {
    const invalidAssetRefProject = {
      scene: {
        vnode1: {
          id: "vnode1",
          name: "Video Clip",
          type: "video",
          parentId: null,
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          assetId: "missing_asset_id",
        },
      },
      metadata: {
        version: "1.0.0",
        duration: 5000,
      },
      assets: {
        other_asset: {
          id: "other_asset",
          type: "video",
          name: "other.mp4",
        },
      },
    };

    expect(() => validateAndSerializeProject(invalidAssetRefProject)).toThrow();
  });
});
