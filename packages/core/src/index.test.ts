import { describe, expect, test } from "vitest";
import {
  CORE_VERSION,
  deserializeSceneNode,
  nodeTypeSchema,
  sceneNodeSchema,
  serializeSceneNode,
} from "./index.js";

test("core version is defined", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});

describe("sceneNodeSchema and nodeTypeSchema", () => {
  test("accepts image node type and src property", () => {
    expect(nodeTypeSchema.parse("image")).toBe("image");

    const imageNode = {
      id: "img-1",
      type: "image" as const,
      name: "AI Generated Asset",
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    };

    const parsed = sceneNodeSchema.parse(imageNode);
    expect(parsed.type).toBe("image");
    expect(parsed.src).toBe(imageNode.src);
  });

  test("serializes and deserializes image node with src attribute correctly", () => {
    const originalNode = {
      id: "node-100",
      type: "image" as const,
      src: "https://example.com/asset.png",
      children: [
        {
          id: "node-101",
          type: "image" as const,
          src: "https://example.com/asset.png",
        },
      ],
    };

    const serialized = serializeSceneNode(originalNode);
    expect(typeof serialized).toBe("string");

    const deserialized = deserializeSceneNode(serialized);
    expect(deserialized).toEqual(originalNode);
    expect(deserialized.src).toBe("https://example.com/asset.png");
    expect(deserialized.children?.[0]?.src).toBe(
      "https://example.com/asset.png",
    );
  });

  test("rejects invalid node types", () => {
    const invalidNode = {
      id: "node-err",
      type: "invalid-type",
    };

    expect(() => sceneNodeSchema.parse(invalidNode)).toThrow();
  });
});
