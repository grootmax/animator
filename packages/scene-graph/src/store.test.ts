import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createSceneGraphStore } from "./store.js";

describe("createSceneGraphStore - recalculateMatrices", () => {
  test("should recalculate matrices without errors for parent and child nodes", () => {
    const store = createSceneGraphStore();

    store.getState().addNode({
      id: "root",
      type: "container",
      parentId: null,
      x: 10,
      y: 20,
    });

    store.getState().addNode({
      id: "child1",
      type: "rect",
      parentId: "root",
      x: 5,
      y: 5,
    });

    store.getState().addNode({
      id: "grandchild1",
      type: "circle",
      parentId: "child1",
      x: 2,
      y: 3,
    });

    // Recalculate matrices
    assert.doesNotThrow(() => {
      store.getState().recalculateMatrices();
    });

    const state = store.getState();
    const root = state.nodes.root;
    const child1 = state.nodes.child1;
    const grandchild1 = state.nodes.grandchild1;

    assert.ok(root);
    assert.ok(child1);
    assert.ok(grandchild1);

    // Verify root world position (translation indices in 3x3 matrix: [6]=x, [7]=y)
    assert.equal(root.worldMatrix[6], 10);
    assert.equal(root.worldMatrix[7], 20);

    // Verify child1 world position (10 + 5 = 15, 20 + 5 = 25)
    assert.equal(child1.worldMatrix[6], 15);
    assert.equal(child1.worldMatrix[7], 25);

    // Verify grandchild1 world position (15 + 2 = 17, 25 + 3 = 28)
    assert.equal(grandchild1.worldMatrix[6], 17);
    assert.equal(grandchild1.worldMatrix[7], 28);
  });

  test("should reset isDirty flag to false on updated nodes", () => {
    const store = createSceneGraphStore();

    store
      .getState()
      .addNode({ id: "root", type: "container", parentId: null, x: 0, y: 0 });
    store
      .getState()
      .addNode({ id: "child", type: "rect", parentId: "root", x: 10, y: 10 });

    assert.equal(store.getState().nodes.root?.isDirty, true);
    assert.equal(store.getState().nodes.child?.isDirty, true);

    store.getState().recalculateMatrices();

    assert.equal(store.getState().nodes.root?.isDirty, false);
    assert.equal(store.getState().nodes.child?.isDirty, false);

    // Mark node dirty via spatial update
    store.getState().updateNode("child", { x: 20 });
    assert.equal(store.getState().nodes.child?.isDirty, true);

    store.getState().recalculateMatrices();

    assert.equal(store.getState().nodes.child?.isDirty, false);
    assert.equal(store.getState().nodes.child?.worldMatrix[6], 20);
  });

  test("should handle empty store and single root node without children gracefully", () => {
    const store = createSceneGraphStore();

    // Empty store
    assert.doesNotThrow(() => {
      store.getState().recalculateMatrices();
    });

    // Single root node
    store.getState().addNode({
      id: "root",
      type: "container",
      parentId: null,
      x: 100,
      y: 200,
    });
    assert.doesNotThrow(() => {
      store.getState().recalculateMatrices();
    });

    assert.equal(store.getState().nodes.root?.worldMatrix[6], 100);
    assert.equal(store.getState().nodes.root?.worldMatrix[7], 200);
    assert.equal(store.getState().nodes.root?.isDirty, false);
  });

  test("should handle multiple sibling children cleanly", () => {
    const store = createSceneGraphStore();

    store.getState().addNode({ id: "root", type: "container", parentId: null });
    store
      .getState()
      .addNode({ id: "c1", type: "rect", parentId: "root", x: 10, y: 0 });
    store
      .getState()
      .addNode({ id: "c2", type: "rect", parentId: "root", x: 20, y: 0 });
    store
      .getState()
      .addNode({ id: "c3", type: "rect", parentId: "root", x: 30, y: 0 });

    store.getState().recalculateMatrices();

    assert.equal(store.getState().nodes.c1?.worldMatrix[6], 10);
    assert.equal(store.getState().nodes.c2?.worldMatrix[6], 20);
    assert.equal(store.getState().nodes.c3?.worldMatrix[6], 30);
    assert.equal(store.getState().nodes.c1?.isDirty, false);
    assert.equal(store.getState().nodes.c2?.isDirty, false);
    assert.equal(store.getState().nodes.c3?.isDirty, false);
  });
});
