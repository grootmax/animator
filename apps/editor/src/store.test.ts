import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useSceneStore } from "./store/sceneStore.js";

describe("useSceneStore Hook", () => {
  test("initializes with default document and selected rect node", () => {
    const { result } = renderHook(() => useSceneStore());
    expect(result.current.doc.layers.length).toBeGreaterThan(0);
    expect(result.current.selectedNodeId).toBe("rect-1");
    expect(result.current.activeTab).toBe("inspector");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test("selects node ID and updates active tab", () => {
    const { result } = renderHook(() => useSceneStore());

    act(() => {
      result.current.selectNode("text-1");
    });
    expect(result.current.selectedNodeId).toBe("text-1");

    act(() => {
      result.current.setActiveTab("params");
    });
    expect(result.current.activeTab).toBe("params");
  });

  test("updates layer properties and supports undo/redo", () => {
    const { result } = renderHook(() => useSceneStore());

    act(() => {
      result.current.updateLayer("rect-1", {
        position: [800, 800],
        fill: "#FF0000",
      });
    });

    const updatedRect = result.current.doc.layers.find(
      (l) => l.id === "rect-1",
    );
    expect(updatedRect?.position).toEqual([800, 800]);
    expect(updatedRect?.fill).toBe("#FF0000");
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });

    const undoneRect = result.current.doc.layers.find((l) => l.id === "rect-1");
    expect(undoneRect?.position).toEqual([540, 540]);
    expect(undoneRect?.fill).toBe("{{accent}}");
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });

    const redoneRect = result.current.doc.layers.find((l) => l.id === "rect-1");
    expect(redoneRect?.position).toEqual([800, 800]);
    expect(redoneRect?.fill).toBe("#FF0000");
  });

  test("manages theme parameters: add, update, remove", () => {
    const { result } = renderHook(() => useSceneStore());

    act(() => {
      result.current.addParam("brandColor", {
        type: "color",
        value: "#00FFCC",
        label: "Brand Color",
      });
    });

    expect(result.current.doc.params.brandColor).toBeDefined();
    expect(result.current.doc.params.brandColor?.value).toBe("#00FFCC");

    act(() => {
      result.current.setParam("brandColor", {
        type: "color",
        value: "#0055AA",
        label: "Brand Color",
      });
    });

    expect(result.current.doc.params.brandColor?.value).toBe("#0055AA");

    act(() => {
      result.current.removeParam("brandColor");
    });

    expect(result.current.doc.params.brandColor).toBeUndefined();
  });
});
