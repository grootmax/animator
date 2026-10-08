import { describe, expect, it } from "vitest";
import {
  parseAndValidateProject,
  projectDataSchema,
  sceneNodeSchema,
  validateAndSerializeProject,
} from "./projectSchema.js";

describe("projectSchema with video nodes", () => {
  it("validates video node properties correctly", () => {
    const videoNode = {
      id: "video-1",
      name: "Background Video",
      type: "video",
      parentId: null,
      children: [],
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      visible: true,
      locked: false,
      assetId: "asset-video-1",
      startTime: 1000,
      mediaOffset: 500,
      duration: 3000,
      volume: 0.8,
      muted: false,
      loop: true,
    };

    const parsed = sceneNodeSchema.parse(videoNode);
    expect(parsed.type).toBe("video");
    expect(parsed.assetId).toBe("asset-video-1");
    expect(parsed.startTime).toBe(1000);
    expect(parsed.mediaOffset).toBe(500);
    expect(parsed.duration).toBe(3000);
    expect(parsed.volume).toBe(0.8);
    expect(parsed.muted).toBe(false);
    expect(parsed.loop).toBe(true);
  });

  it("validates asset references during project save and load operations", () => {
    const validProject = {
      scene: {
        "video-node-1": {
          id: "video-node-1",
          name: "Video Node",
          type: "video",
          parentId: null,
          children: [],
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          assetId: "valid-asset-id",
          startTime: 0,
          mediaOffset: 0,
          duration: 2000,
        },
      },
      assets: {
        "valid-asset-id": {
          id: "valid-asset-id",
          type: "video",
          name: "ocean.mp4",
          src: "assets/ocean.mp4",
        },
      },
      animations: [],
      metadata: { version: "1.0.0", duration: 2000 },
    };

    const json = validateAndSerializeProject(validProject);
    expect(json).toContain("valid-asset-id");

    const loaded = parseAndValidateProject(json);
    expect(loaded.scene["video-node-1"]?.assetId).toBe("valid-asset-id");
  });

  it("throws validation error when a video node references an unregistered assetId", () => {
    const invalidProject = {
      scene: {
        "video-node-1": {
          id: "video-node-1",
          name: "Video Node",
          type: "video",
          parentId: null,
          children: [],
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          assetId: "missing-asset-id",
        },
      },
      assets: {},
      animations: [],
      metadata: { version: "1.0.0", duration: 1000 },
    };

    expect(() => projectDataSchema.parse(invalidProject)).toThrowError(
      /missing assetId/,
    );
  });
});
