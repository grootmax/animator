import {
  type FontAsset,
  FontAssetRegistry,
  type NodeType,
  type SceneNode,
} from "./sceneNode.js";

export interface SvgParseResult {
  nodes: SceneNode[];
  fontAssets: FontAsset[];
}

export class SvgParser {
  private fontRegistry: FontAssetRegistry;

  constructor(fontRegistry?: FontAssetRegistry) {
    this.fontRegistry = fontRegistry || new FontAssetRegistry();
  }

  public getFontRegistry(): FontAssetRegistry {
    return this.fontRegistry;
  }

  public parse(svgString: string): SvgParseResult {
    this.parseStyles(svgString);
    const nodes = this.parseElements(svgString);

    return {
      nodes,
      fontAssets: this.fontRegistry.getAll(),
    };
  }

  private parseStyles(svgString: string): void {
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch = styleRegex.exec(svgString);

    while (styleMatch !== null) {
      const cssContent = styleMatch[1];
      if (cssContent) {
        this.parseFontFaceRules(cssContent);
      }
      styleMatch = styleRegex.exec(svgString);
    }
  }

  public parseFontFaceRules(cssContent: string): void {
    const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
    let fontFaceMatch = fontFaceRegex.exec(cssContent);

    while (fontFaceMatch !== null) {
      const body = fontFaceMatch[1];
      if (body) {
        const familyMatch = /font-family\s*:\s*['"]?([^;'"]+)['"]?/i.exec(body);
        const srcMatch = /src\s*:\s*url\((['"]?)([^'")]+)\1\)/i.exec(body);
        const weightMatch = /font-weight\s*:\s*([^;]+)/i.exec(body);
        const styleMatch = /font-style\s*:\s*([^;]+)/i.exec(body);
        const formatMatch = /format\((['"]?)([^'")]+)\1\)/i.exec(body);

        if (familyMatch && srcMatch) {
          const family = familyMatch[1]?.trim() ?? "";
          const src = srcMatch[2]?.trim() ?? "";
          const weight = weightMatch ? weightMatch[1]?.trim() : undefined;
          const style = styleMatch ? styleMatch[1]?.trim() : undefined;
          const format = formatMatch ? formatMatch[2]?.trim() : undefined;

          const cleanFamily = family.replace(/['"]/g, "");
          const id = `font-${cleanFamily.toLowerCase().replace(/\s+/g, "-")}`;

          const asset: FontAsset = {
            id,
            family: cleanFamily,
            src,
            ...(weight && { weight }),
            ...(style && { style }),
            ...(format && { format }),
          };

          this.fontRegistry.register(asset);
        }
      }
      fontFaceMatch = fontFaceRegex.exec(cssContent);
    }
  }

  private parseElements(svgString: string): SceneNode[] {
    const nodes: SceneNode[] = [];

    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, "image/svg+xml");
      const root = doc.documentElement;
      this.processDomElement(root, null, nodes);
    } else {
      this.parseElementsWithRegex(svgString, nodes);
    }

    return nodes;
  }

  private processDomElement(
    element: Element,
    parentId: string | null,
    nodes: SceneNode[],
  ): void {
    const tagName = element.tagName.toLowerCase();
    if (["defs", "style", "script"].includes(tagName)) {
      return;
    }

    const id = element.id || `node-${nodes.length + 1}`;
    let node: SceneNode | null = null;

    if (tagName === "text") {
      const textContent = element.textContent || "";
      const fontFamilyAttr = element.getAttribute("font-family") || undefined;
      const fontSizeAttr = element.getAttribute("font-size");
      const fontWeightAttr = element.getAttribute("font-weight") || undefined;
      const fontStyleAttr = element.getAttribute("font-style") || undefined;
      const fill = element.getAttribute("fill") || undefined;
      const x = Number.parseFloat(element.getAttribute("x") || "0");
      const y = Number.parseFloat(element.getAttribute("y") || "0");

      let fontAssetId: string | undefined;
      if (fontFamilyAttr) {
        const registered = this.fontRegistry.findByFamily(fontFamilyAttr);
        if (registered) {
          fontAssetId = registered.id;
        }
      }

      node = {
        id,
        name: id,
        type: "text",
        ...(parentId && { parentId }),
        text: textContent,
        ...(fontFamilyAttr && { fontFamily: fontFamilyAttr }),
        ...(fontSizeAttr && { fontSize: Number.parseFloat(fontSizeAttr) }),
        ...(fontWeightAttr && { fontWeight: fontWeightAttr }),
        ...(fontStyleAttr && { fontStyle: fontStyleAttr }),
        ...(fontAssetId && { fontAssetId }),
        ...(fill && { fill }),
        x,
        y,
      };
    } else if (
      [
        "rect",
        "circle",
        "ellipse",
        "path",
        "g",
        "svg",
        "image",
        "line",
        "polyline",
      ].includes(tagName)
    ) {
      const type: NodeType =
        tagName === "g" || tagName === "svg" ? "group" : (tagName as NodeType);
      const fill = element.getAttribute("fill") || undefined;
      const stroke = element.getAttribute("stroke") || undefined;

      node = {
        id,
        name: id,
        type,
        ...(parentId && { parentId }),
        ...(fill && { fill }),
        ...(stroke && { stroke }),
      };
    }

    if (node) {
      nodes.push(node);
      for (let i = 0; i < element.children.length; i++) {
        const child = element.children[i];
        if (child) {
          this.processDomElement(child, id, nodes);
        }
      }
    } else {
      for (let i = 0; i < element.children.length; i++) {
        const child = element.children[i];
        if (child) {
          this.processDomElement(child, parentId, nodes);
        }
      }
    }
  }

  private parseElementsWithRegex(svgString: string, nodes: SceneNode[]): void {
    const textTagRegex = /<text\s+([^>]*)\s*>([\s\S]*?)<\/text>/gi;
    let match = textTagRegex.exec(svgString);

    while (match !== null) {
      const attrsStr = match[1] || "";
      const content = match[2]?.replace(/<[^>]+>/g, "").trim() || "";

      const getAttr = (name: string): string | undefined => {
        const r = new RegExp(`${name}=["']([^"']+)["']`, "i");
        const m = r.exec(attrsStr);
        return m ? m[1] : undefined;
      };

      const id = getAttr("id") || `text-${nodes.length + 1}`;
      const fontFamily = getAttr("font-family");
      const fontSizeStr = getAttr("font-size");
      const fontWeight = getAttr("font-weight");
      const fontStyle = getAttr("font-style");
      const fill = getAttr("fill");
      const xStr = getAttr("x");
      const yStr = getAttr("y");

      let fontAssetId: string | undefined;
      if (fontFamily) {
        const registered = this.fontRegistry.findByFamily(fontFamily);
        if (registered) {
          fontAssetId = registered.id;
        }
      }

      const node: SceneNode = {
        id,
        name: id,
        type: "text",
        text: content,
        ...(fontFamily && { fontFamily }),
        ...(fontSizeStr && { fontSize: Number.parseFloat(fontSizeStr) }),
        ...(fontWeight && { fontWeight }),
        ...(fontStyle && { fontStyle }),
        ...(fontAssetId && { fontAssetId }),
        ...(fill && { fill }),
        ...(xStr && { x: Number.parseFloat(xStr) }),
        ...(yStr && { y: Number.parseFloat(yStr) }),
      };

      nodes.push(node);
      match = textTagRegex.exec(svgString);
    }
  }
}
