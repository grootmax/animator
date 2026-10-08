import {
  type FontAsset,
  FontAssetRegistry,
  type SceneNode,
} from "@animator/core";
import { describe, expect, it } from "vitest";
import { FontAssetLoader, PIXI, PixiBridge } from "./index.js";

describe("PixiBridge & FontAssetLoader - Web Font Management", () => {
  it("creates PIXI.Text object with fallback system font while custom font is loading", () => {
    const fontRegistry = new FontAssetRegistry();
    const fontAsset: FontAsset = {
      id: "font-custom",
      family: "CustomTypeface",
      src: "data:font/woff2;base64,12345",
    };
    fontRegistry.register(fontAsset);

    const fontLoader = new FontAssetLoader();
    const bridge = new PixiBridge({ fontRegistry, fontLoader });

    const textNode: SceneNode = {
      id: "heading-1",
      name: "Heading",
      type: "text",
      text: "Hello Pixi",
      fontAssetId: "font-custom",
      fontFamily: "sans-serif",
      fontSize: 32,
    };

    bridge.syncNodes([textNode]);

    const pixiNode = bridge.getPixiNode("heading-1");
    expect(pixiNode).toBeDefined();
    expect(pixiNode).toBeInstanceOf(PIXI.Text);

    const pixiText = pixiNode as PIXI.Text;
    expect(pixiText.text).toBe("Hello Pixi");
    expect(pixiText.style.fontSize).toBe(32);
    expect(pixiText.style.fontFamily).toBe("sans-serif");
  });

  it("updates PIXI.Text font family asynchronously when custom font asset finishes loading", async () => {
    const fontRegistry = new FontAssetRegistry();
    const fontAsset: FontAsset = {
      id: "font-custom-2",
      family: "MyWebFont",
      src: "https://example.com/fonts/mywebfont.woff2",
    };
    fontRegistry.register(fontAsset);

    const fontLoader = new FontAssetLoader();
    const bridge = new PixiBridge({ fontRegistry, fontLoader });

    const textNode: SceneNode = {
      id: "sub-title",
      name: "Subtitle",
      type: "text",
      text: "Custom Font Text",
      fontAssetId: "font-custom-2",
      fontFamily: "sans-serif",
    };

    bridge.syncNodes([textNode]);

    const pixiText = bridge.getPixiNode("sub-title") as PIXI.Text;
    expect(pixiText.style.fontFamily).toBe("sans-serif");

    await fontLoader.loadFont(fontAsset);

    expect(pixiText.style.fontFamily).toBe("MyWebFont");
  });

  it("keeps text nodes as editable string fields in scene graph state", () => {
    const bridge = new PixiBridge();

    const textNode: SceneNode = {
      id: "editable-text",
      name: "Editable",
      type: "text",
      text: "Initial String",
    };

    bridge.syncNodes([textNode]);
    const pixiText = bridge.getPixiNode("editable-text") as PIXI.Text;
    expect(pixiText.text).toBe("Initial String");

    textNode.text = "Updated String Value";
    bridge.syncNodes([textNode]);

    expect(pixiText.text).toBe("Updated String Value");
  });
});
