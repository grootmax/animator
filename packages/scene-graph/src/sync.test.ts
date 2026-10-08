import { describe, expect, it, vi } from "vitest";
import { createSceneGraphStore } from "./store.js";
import type { SyncMessage } from "./sync.js";

describe("packages/scene-graph - sync and store", () => {
  it("dispatches broadcast callback on local mutation", () => {
    const broadcastCb = vi.fn();
    const store = createSceneGraphStore(broadcastCb);

    store.getState().addNode({ id: "node1", type: "rect", fill: "red" });

    expect(broadcastCb).toHaveBeenCalledTimes(1);
    expect(broadcastCb).toHaveBeenCalledWith({
      type: "addNode",
      payload: { id: "node1", type: "rect", fill: "red" },
    });
    expect(store.getState().nodes.node1).toBeDefined();
    expect(store.getState().nodes.node1?.fill).toBe("red");
  });

  it("applies remote mutation without re-triggering broadcast", () => {
    const broadcastCb = vi.fn();
    const store = createSceneGraphStore(broadcastCb);

    const remoteMsg: SyncMessage = {
      type: "addNode",
      payload: { id: "remote1", type: "path" },
    };

    store.applyRemote?.(remoteMsg);

    expect(broadcastCb).not.toHaveBeenCalled();
    expect(store.getState().nodes.remote1).toBeDefined();
    expect(store.getState().nodes.remote1?.type).toBe("path");
  });

  it("handles remote updateNode and reorderNode correctly", () => {
    const broadcastCb = vi.fn();
    const store = createSceneGraphStore(broadcastCb);

    store.applyRemote?.({
      type: "addNode",
      payload: { id: "node2", type: "group" },
    });

    store.applyRemote?.({
      type: "updateNode",
      payload: { id: "node2", updates: { width: 100 } },
    });

    expect(store.getState().nodes.node2?.width).toBe(100);

    store.applyRemote?.({
      type: "reorderNode",
      payload: { id: "node2", newParentId: "parent1", index: 0 },
    });

    expect(store.getState().nodes.node2?.parentId).toBe("parent1");
  });
});
