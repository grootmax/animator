import type { SceneNode } from "@animator/core";
import { describe, expect, test, vi } from "vitest";
import { PixiBridge, RENDER_VERSION, TextureManager } from "./index.js";

test("render version is defined", () => {
  expect(RENDER_VERSION).toBe("0.0.0");
});

describe("TextureManager", () => {
  test("correctly increments ref-counts when requesting textures", () => {
    const tm = new TextureManager();
    const uri = "data:image/png;base64,sample1";

    expect(tm.getRefCount(uri)).toBe(0);
    expect(tm.hasTexture(uri)).toBe(false);

    const tex1 = tm.acquire(uri);
    expect(tm.getRefCount(uri)).toBe(1);
    expect(tm.hasTexture(uri)).toBe(true);

    const tex2 = tm.acquire(uri);
    expect(tm.getRefCount(uri)).toBe(2);
    expect(tex1).toBe(tex2);
  });

  test("destroys WebGL textures and purges Pixi texture caches only when ref-counts hit zero", () => {
    const deleteTextureMock = vi.fn();
    const mockGl = {
      createTexture: vi.fn().mockReturnValue({ id: "gl-tex-1" }),
      deleteTexture: deleteTextureMock,
    } as unknown as WebGLRenderingContext;

    const pixiCache = new Map<string, unknown>();
    const tm = new TextureManager({ gl: mockGl, pixiCache });

    const uri = "asset-uri-1";
    const tex = tm.acquire(uri);
    tm.acquire(uri); // refCount = 2

    expect(tm.getRefCount(uri)).toBe(2);
    expect(pixiCache.has(uri)).toBe(true);

    // Release once: refCount becomes 1
    const releasedFirst = tm.release(uri);
    expect(releasedFirst).toBe(false);
    expect(tm.getRefCount(uri)).toBe(1);
    expect(tex.destroyed).toBe(false);
    expect(deleteTextureMock).not.toHaveBeenCalled();
    expect(pixiCache.has(uri)).toBe(true);

    // Release second time: refCount hits 0
    const releasedSecond = tm.release(uri);
    expect(releasedSecond).toBe(true);
    expect(tm.getRefCount(uri)).toBe(0);
    expect(tm.hasTexture(uri)).toBe(false);
    expect(tex.destroyed).toBe(true);
    expect(deleteTextureMock).toHaveBeenCalledWith(tex.webGlTexture);
    expect(pixiCache.has(uri)).toBe(false);
  });

  test("rapid iterative generation cleans up unreferenced textures without leaks", () => {
    const tm = new TextureManager();

    const uri1 = "gen-image-1";
    const uri2 = "gen-image-2";
    const uri3 = "gen-image-3";

    tm.acquire(uri1);
    expect(tm.hasTexture(uri1)).toBe(true);

    // User generates image 2, releasing image 1
    tm.release(uri1);
    tm.acquire(uri2);
    expect(tm.hasTexture(uri1)).toBe(false);
    expect(tm.hasTexture(uri2)).toBe(true);

    // User generates image 3, releasing image 2
    tm.release(uri2);
    tm.acquire(uri3);
    expect(tm.hasTexture(uri2)).toBe(false);
    expect(tm.hasTexture(uri3)).toBe(true);
  });
});

describe("PixiBridge & Shared Duplicated Image Nodes", () => {
  test("syncNodes delegates texture lifecycle management to TextureManager", () => {
    const tm = new TextureManager();
    const bridge = new PixiBridge(tm);

    const nodes: SceneNode[] = [
      {
        id: "node-1",
        type: "image",
        src: "cat.png",
      },
    ];

    bridge.syncNodes(nodes);
    expect(tm.getRefCount("cat.png")).toBe(1);

    const bNode = bridge.getNode("node-1");
    expect(bNode).toBeDefined();
    expect(bNode?.texture?.src).toBe("cat.png");
  });

  test("updating one node in a set of duplicated image nodes leaves sibling node textures intact", () => {
    const tm = new TextureManager();
    const bridge = new PixiBridge(tm);

    const sharedSrc = "shared-ai-image.png";
    const dupNode1: SceneNode = { id: "node-a", type: "image", src: sharedSrc };
    const dupNode2: SceneNode = { id: "node-b", type: "image", src: sharedSrc };

    // Initial sync with duplicated image nodes
    bridge.syncNodes([dupNode1, dupNode2]);
    expect(tm.getRefCount(sharedSrc)).toBe(2);

    // User changes dupNode1 src to new image
    const newSrc = "new-ai-image.png";
    const updatedNode1: SceneNode = {
      id: "node-a",
      type: "image",
      src: newSrc,
    };

    bridge.syncNodes([updatedNode1, dupNode2]);

    // Node A now uses newSrc
    expect(tm.getRefCount(newSrc)).toBe(1);
    // Node B still uses sharedSrc, refCount decremented from 2 to 1 but texture remains active
    expect(tm.getRefCount(sharedSrc)).toBe(1);
    expect(tm.hasTexture(sharedSrc)).toBe(true);

    const siblingNodeB = bridge.getNode("node-b");
    expect(siblingNodeB?.texture?.destroyed).toBe(false);
    expect(siblingNodeB?.texture?.src).toBe(sharedSrc);
  });

  test("deleting one duplicate node leaves sibling duplicate node textures intact, deleting last duplicate destroys texture", () => {
    const tm = new TextureManager();
    const bridge = new PixiBridge(tm);

    const sharedSrc = "shared-logo.png";
    const dupNode1: SceneNode = { id: "node-1", type: "image", src: sharedSrc };
    const dupNode2: SceneNode = { id: "node-2", type: "image", src: sharedSrc };

    bridge.syncNodes([dupNode1, dupNode2]);
    expect(tm.getRefCount(sharedSrc)).toBe(2);

    // Remove dupNode1
    bridge.syncNodes([dupNode2]);
    expect(tm.getRefCount(sharedSrc)).toBe(1);
    expect(tm.hasTexture(sharedSrc)).toBe(true);

    // Remove dupNode2 as well (last node deleted)
    bridge.syncNodes([]);
    expect(tm.getRefCount(sharedSrc)).toBe(0);
    expect(tm.hasTexture(sharedSrc)).toBe(false);
  });
});
