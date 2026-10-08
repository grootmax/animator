import { describe, expect, it } from "vitest";
import {
  type FontAsset,
  FontAssetRegistry,
  type SceneNode,
  SvgParser,
  SvgSerializer,
  projectDataSchema,
  sceneNodeSchema,
  validateAndSerializeProject,
} from "./index.js";

describe("Text Node Schema & Validation", () => {
  it("validates sceneNodeSchema with text properties and fontAssetId", () => {
    const textNode: SceneNode = {
      id: "title-1",
      name: "Title Text",
      type: "text",
      text: "Hello World",
      fontAssetId: "font-roboto",
      fontFamily: "Roboto",
      fontSize: 32,
      fontWeight: "bold",
      fontStyle: "normal",
      fill: "#FF0000",
      x: 100,
      y: 200,
    };

    const parsed = sceneNodeSchema.parse(textNode);
    expect(parsed.type).toBe("text");
    expect(parsed.text).toBe("Hello World");
    expect(parsed.fontAssetId).toBe("font-roboto");
    expect(parsed.fontFamily).toBe("Roboto");
    expect(parsed.fontSize).toBe(32);
    expect(parsed.fontWeight).toBe("bold");
  });

  it("validates projectDataSchema with text nodes and font assets", () => {
    const project = {
      scene: {
        "title-1": {
          id: "title-1",
          name: "Title",
          type: "text",
          text: "Editable String",
          fontAssetId: "font-inter",
          fontFamily: "Inter",
        },
      },
      fontAssets: {
        "font-inter": {
          id: "font-inter",
          family: "Inter",
          src: "data:font/woff2;base64,AAA...",
          weight: "600",
        },
      },
      metadata: {
        version: "1.0.0",
        duration: 5,
      },
    };

    const serialized = validateAndSerializeProject(project);
    expect(serialized).toContain("Editable String");
    expect(serialized).toContain("font-inter");

    const parsed = projectDataSchema.parse(project);
    expect(parsed.scene["title-1"]?.text).toBe("Editable String");
    expect(parsed.fontAssets?.["font-inter"]?.family).toBe("Inter");
  });
});

describe("SvgParser - Embedded Font & Text Parsing", () => {
  it("parses @font-face declarations from SVG <style> blocks and registers font assets", () => {
    const svgWithFonts = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style type="text/css">
            @font-face {
              font-family: 'CustomFont';
              src: url('data:font/woff2;base64,d09GMgABAAAAA...') format('woff2');
              font-weight: 700;
              font-style: normal;
            }
          </style>
        </defs>
        <text id="heading" x="50" y="80" font-family="CustomFont" font-size="24" fill="#333333">
          Embedded Web Font Text
        </text>
      </svg>
    `;

    const parser = new SvgParser();
    const result = parser.parse(svgWithFonts);

    expect(result.fontAssets.length).toBe(1);
    const fontAsset = result.fontAssets[0];
    expect(fontAsset?.family).toBe("CustomFont");
    expect(fontAsset?.src).toBe("data:font/woff2;base64,d09GMgABAAAAA...");
    expect(fontAsset?.weight).toBe("700");

    expect(result.nodes.length).toBeGreaterThan(0);
    const textNode = result.nodes.find((n: SceneNode) => n.type === "text");
    expect(textNode).toBeDefined();
    expect(textNode?.text).toBe("Embedded Web Font Text");
    expect(textNode?.fontFamily).toBe("CustomFont");
    expect(textNode?.fontAssetId).toBe(fontAsset?.id);
  });
});

describe("SvgSerializer - @font-face Export", () => {
  it("generates @font-face rules inside SVG <defs> and serializes text nodes", () => {
    const fontRegistry = new FontAssetRegistry();
    const fontAsset: FontAsset = {
      id: "font-brand",
      family: "BrandFont",
      src: "https://example.com/fonts/brand.woff2",
      format: "woff2",
      weight: "600",
    };
    fontRegistry.register(fontAsset);

    const textNode: SceneNode = {
      id: "banner-text",
      name: "Banner",
      type: "text",
      text: "Dynamic Headline",
      fontAssetId: "font-brand",
      fontFamily: "BrandFont",
      fontSize: 48,
      fill: "#112233",
      x: 20,
      y: 40,
    };

    const serializer = new SvgSerializer();
    const exportedSvg = serializer.serialize([textNode], fontRegistry);

    expect(exportedSvg).toContain("<defs>");
    expect(exportedSvg).toContain("@font-face");
    expect(exportedSvg).toContain("font-family: 'BrandFont';");
    expect(exportedSvg).toContain(
      "src: url('https://example.com/fonts/brand.woff2') format('woff2');",
    );
    expect(exportedSvg).toContain('<text id="banner-text"');
    expect(exportedSvg).toContain('font-family="BrandFont"');
    expect(exportedSvg).toContain("Dynamic Headline");
  });

  it("allows editing text string in scene node state and updating serialization", () => {
    const textNode: SceneNode = {
      id: "editable-1",
      name: "Editable",
      type: "text",
      text: "Original Text",
      fontFamily: "Arial",
    };

    const serializer = new SvgSerializer();
    let svg = serializer.serialize([textNode]);
    expect(svg).toContain("Original Text");

    textNode.text = "Updated Editable Text";
    svg = serializer.serialize([textNode]);
    expect(svg).toContain("Updated Editable Text");
  });
});
