import { z } from "zod";
import type { AssetStore } from "./assetStore.js";

export const ImageNodeSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  name: z.string().optional(),
  assetId: z.string().optional(),
  assetRef: z.string().optional(),
  dataUrl: z.string().optional(),
  url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  opacity: z.number().optional(),
});

export const BaseNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  opacity: z.number().optional(),
});

export const NodeSchema = z.union([ImageNodeSchema, BaseNodeSchema]);

export const AssetMetadataSchema = z.object({
  assetId: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().optional(),
  nodes: z.array(z.record(z.string(), z.unknown())),
  assets: z.record(z.string(), AssetMetadataSchema).optional(),
});

export type ImageNode = z.infer<typeof ImageNodeSchema>;
export type BaseNode = z.infer<typeof BaseNodeSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export interface SerializationResult {
  serializedProject: Project;
  jsonString: string;
  jsonSizeBytes: number;
  uncompressedInlineSizeBytes: number;
  sizeReductionPercent: number;
}

/**
 * Serializes a project document.
 * Converts inline base64 image strings into content-addressed asset IDs in AssetStore,
 * excluding heavy binary payloads from the resulting JSON file.
 */
export function serializeProject(
  project: Project,
  assetStore: AssetStore,
): SerializationResult {
  // First calculate uncompressed size with inline dataUrls
  const uncompressedJson = JSON.stringify(project);
  const uncompressedInlineSizeBytes = Buffer.byteLength(
    uncompressedJson,
    "utf8",
  );

  const newNodes = project.nodes.map((rawNode) => {
    const node = { ...rawNode };
    if (node.type === "image") {
      const dataUrl =
        (node.dataUrl as string | undefined) ||
        (node.url as string | undefined);
      if (dataUrl?.startsWith("data:")) {
        // Store in AssetStore & replace with assetId
        const record = assetStore.storeSync(dataUrl, {
          ownerId: node.id as string,
        });
        node.assetId = record.assetId;
        node.assetRef = record.assetId;
        node.dataUrl = undefined;
        node.url = undefined;
      } else if (node.assetId) {
        // Asset already in store, ensure reference counted
        assetStore.addRef(node.assetId as string, node.id as string);
        node.assetRef = node.assetId;
      }
    }
    return node;
  });

  const assetsMeta: Record<string, z.infer<typeof AssetMetadataSchema>> = {};
  for (const rawNode of newNodes) {
    if (rawNode.type === "image" && rawNode.assetId) {
      const assetId = rawNode.assetId as string;
      const record = assetStore.get(assetId);
      if (record) {
        assetsMeta[assetId] = {
          assetId: record.assetId,
          mimeType: record.mimeType,
          size: record.size,
        };
      }
    }
  }

  const serializedProject: Project = {
    ...project,
    nodes: newNodes,
    assets: assetsMeta,
  };

  const jsonString = JSON.stringify(serializedProject, null, 2);
  const jsonSizeBytes = Buffer.byteLength(jsonString, "utf8");

  const sizeReductionPercent =
    uncompressedInlineSizeBytes > 0
      ? Math.max(
          0,
          ((uncompressedInlineSizeBytes - jsonSizeBytes) /
            uncompressedInlineSizeBytes) *
            100,
        )
      : 0;

  return {
    serializedProject,
    jsonString,
    jsonSizeBytes,
    uncompressedInlineSizeBytes,
    sizeReductionPercent,
  };
}

/**
 * Deserializes project JSON.
 * Validates schema and maintains backward compatibility for legacy JSON files containing inline base64 data URLs.
 */
export function deserializeProject(
  json: string | object,
  assetStore?: AssetStore,
): Project {
  const rawObj = typeof json === "string" ? JSON.parse(json) : json;
  const validated = ProjectSchema.parse(rawObj);

  const updatedNodes = validated.nodes.map((rawNode) => {
    const node = { ...rawNode };
    if (node.type === "image") {
      // Backward compatibility: inline base64 dataUrl
      const dataUrl =
        (node.dataUrl as string | undefined) ||
        (node.url as string | undefined);
      if (dataUrl?.startsWith("data:") && assetStore) {
        const record = assetStore.storeSync(dataUrl, {
          ownerId: node.id as string,
        });
        node.assetId = record.assetId;
        node.assetRef = record.assetId;
        node.dataUrl = undefined;
        node.url = undefined;
      } else if (node.assetId && assetStore) {
        assetStore.addRef(node.assetId as string, node.id as string);
      }
    }
    return node;
  });

  return {
    ...validated,
    nodes: updatedNodes,
  };
}
