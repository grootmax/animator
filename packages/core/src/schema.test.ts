import { describe, expect, it } from "vitest";
import { AssetStore } from "./assetStore.js";
import {
  ProjectSchema,
  deserializeProject,
  serializeProject,
} from "./schema.js";

// Generate a mock heavy base64 image payload (~100 KB base64 payload)
function generateHeavyBase64(sizeKb = 100, seed = 0): string {
  const bytes = new Uint8Array(sizeKb * 1024);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = (i + seed * 13) % 256;
  }
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("Project Schema & Serialization", () => {
  it("validates image nodes with assetId and assetRef properties", () => {
    const rawProject = {
      id: "project-1",
      name: "Test Project",
      nodes: [
        {
          id: "img-1",
          type: "image",
          assetId: "asset-123456",
          assetRef: "asset-123456",
          width: 800,
          height: 600,
        },
      ],
    };

    const parsed = ProjectSchema.parse(rawProject);
    expect(parsed.id).toBe("project-1");
    expect(parsed.nodes[0]?.assetId).toBe("asset-123456");
  });

  it("reduces project JSON serialization size by > 90% for image-heavy projects", () => {
    const assetStore = new AssetStore();

    // Create a project with 5 large image nodes containing inline base64 data (~500 KB total payload)
    const heavyImage1 = generateHeavyBase64(100, 1);
    const heavyImage2 = generateHeavyBase64(100, 2);
    const heavyImage3 = generateHeavyBase64(100, 3);

    const projectWithInlineImages = {
      id: "proj-heavy",
      name: "Heavy AI Assets Project",
      nodes: [
        {
          id: "node-1",
          type: "image",
          dataUrl: heavyImage1,
          width: 1024,
          height: 1024,
        },
        {
          id: "node-2",
          type: "image",
          dataUrl: heavyImage2,
          width: 1024,
          height: 1024,
        },
        {
          id: "node-3",
          type: "image",
          dataUrl: heavyImage3,
          width: 1024,
          height: 1024,
        },
      ],
    };

    const result = serializeProject(projectWithInlineImages, assetStore);

    // Assert that serialized project JSON excludes inline base64 binary payloads
    expect(result.jsonString).not.toContain("data:image/png;base64,");
    expect(result.serializedProject.nodes[0]?.assetId).toMatch(/^asset-/);
    expect(result.serializedProject.nodes[0]?.dataUrl).toBeUndefined();

    // Assert > 90% reduction in JSON serialization size
    expect(result.sizeReductionPercent).toBeGreaterThan(90);
    expect(assetStore.count).toBe(3);
  });

  it("maintains backward compatibility when deserializing legacy JSON with inline base64 data URLs", () => {
    const assetStore = new AssetStore();
    const legacyBase64 = generateHeavyBase64(10);

    const legacyJson = JSON.stringify({
      id: "legacy-proj",
      name: "Legacy Project",
      nodes: [
        {
          id: "legacy-node-1",
          type: "image",
          dataUrl: legacyBase64,
          width: 500,
          height: 500,
        },
      ],
    });

    const deserialized = deserializeProject(legacyJson, assetStore);

    expect(deserialized.nodes[0]?.assetId).toMatch(/^asset-/);
    expect(deserialized.nodes[0]?.dataUrl).toBeUndefined();
    expect(assetStore.count).toBe(1);
    expect(assetStore.has(deserialized.nodes[0]?.assetId as string)).toBe(true);
  });
});
