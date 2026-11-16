import { describe, expect, test } from "vitest";
import { PlayerHarness } from "./PlayerHarness.js";
import { getEditorCanvasKit } from "./canvaskit.js";
import { App } from "./main.js";
import { createInitialEditorState } from "./stateBridge.js";

describe("Editor workspace integration", () => {
  test("App function component exists", () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe("function");
  });

  test("PlayerHarness component exists", () => {
    expect(PlayerHarness).toBeDefined();
    expect(typeof PlayerHarness).toBe("function");
  });

  test("getEditorCanvasKit initializes and returns full CanvasKit instance with Skottie", async () => {
    const ck = await getEditorCanvasKit();
    expect(ck).toBeDefined();
    expect(typeof ck.MakeManagedAnimation).toBe("function");
  });

  test("createInitialEditorState initializes state with compiled Lottie JSON", () => {
    const state = createInitialEditorState();
    expect(state.doc).toBeDefined();
    expect(state.revision).toBe(0);
    expect(state.lottieJson).toBeDefined();
    expect(state.lottieJson.v).toBe("5.7.0");
    expect(state.lottieJson.layers).toBeDefined();
  });
});
