import {
  type FontAsset,
  FontAssetRegistry,
  type SceneNode,
} from "./sceneNode.js";

export class SvgSerializer {
  public serialize(
    nodes: Record<string, SceneNode> | SceneNode[],
    fontAssets?: Record<string, FontAsset> | FontAsset[] | FontAssetRegistry,
  ): string {
    const nodeArray: SceneNode[] = Array.isArray(nodes)
      ? nodes
      : Object.values(nodes);

    let assetsList: FontAsset[] = [];
    if (fontAssets) {
      if (fontAssets instanceof FontAssetRegistry) {
        assetsList = fontAssets.getAll();
      } else if (Array.isArray(fontAssets)) {
        assetsList = fontAssets;
      } else {
        assetsList = Object.values(fontAssets);
      }
    }

    const fontAssetMap = new Map<string, FontAsset>();
    for (const asset of assetsList) {
      fontAssetMap.set(asset.id, asset);
    }

    let svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n`;

    if (fontAssetMap.size > 0) {
      svgString += "  <defs>\n";
      svgString += `    <style type="text/css">\n`;
      for (const asset of fontAssetMap.values()) {
        svgString += "      @font-face {\n";
        svgString += `        font-family: '${asset.family}';\n`;
        svgString += `        src: url('${asset.src}')`;
        if (asset.format) {
          svgString += ` format('${asset.format}')`;
        }
        svgString += ";\n";
        if (asset.weight) {
          svgString += `        font-weight: ${asset.weight};\n`;
        }
        if (asset.style) {
          svgString += `        font-style: ${asset.style};\n`;
        }
        svgString += "      }\n";
      }
      svgString += "    </style>\n";
      svgString += "  </defs>\n";
    }

    const rootNodes = nodeArray.filter((node) => !node.parentId);
    for (const rootNode of rootNodes) {
      svgString += this.serializeNode(rootNode, nodeArray, 1);
    }

    svgString += "</svg>";
    return svgString;
  }

  private serializeNode(
    node: SceneNode,
    allNodes: SceneNode[],
    indentLevel: number,
  ): string {
    if (node.visible === false) return "";

    const indent = "  ".repeat(indentLevel);
    const transforms: string[] = [];
    if (node.x || node.y) {
      transforms.push(`translate(${node.x || 0}, ${node.y || 0})`);
    }
    if (node.rotation) {
      transforms.push(`rotate(${node.rotation})`);
    }
    if (
      (node.scaleX !== undefined && node.scaleX !== 1) ||
      (node.scaleY !== undefined && node.scaleY !== 1)
    ) {
      transforms.push(`scale(${node.scaleX ?? 1}, ${node.scaleY ?? 1})`);
    }

    const transformAttr =
      transforms.length > 0 ? ` transform="${transforms.join(" ")}"` : "";
    const opacityAttr =
      node.opacity !== undefined && node.opacity !== 1
        ? ` opacity="${node.opacity}"`
        : "";
    const fillAttr = node.fill ? ` fill="${node.fill}"` : "";
    const strokeAttr = node.stroke ? ` stroke="${node.stroke}"` : "";
    const strokeWidthAttr =
      node.strokeWidth !== undefined
        ? ` stroke-width="${node.strokeWidth}"`
        : "";

    const commonAttrs = `id="${node.id}"${transformAttr}${opacityAttr}${fillAttr}${strokeAttr}${strokeWidthAttr}`;

    switch (node.type) {
      case "text": {
        const fontFamilyAttr = node.fontFamily
          ? ` font-family="${node.fontFamily}"`
          : "";
        const fontSizeAttr =
          node.fontSize !== undefined ? ` font-size="${node.fontSize}"` : "";
        const fontWeightAttr = node.fontWeight
          ? ` font-weight="${node.fontWeight}"`
          : "";
        const fontStyleAttr = node.fontStyle
          ? ` font-style="${node.fontStyle}"`
          : "";
        const xAttr = node.x !== undefined ? ` x="${node.x}"` : "";
        const yAttr = node.y !== undefined ? ` y="${node.y}"` : "";

        return `${indent}<text ${commonAttrs}${xAttr}${yAttr}${fontFamilyAttr}${fontSizeAttr}${fontWeightAttr}${fontStyleAttr}>${
          node.text || ""
        }</text>\n`;
      }
      case "group":
      case "container": {
        let str = `${indent}<g ${commonAttrs}>\n`;
        const children = allNodes.filter((n) => n.parentId === node.id);
        for (const child of children) {
          str += this.serializeNode(child, allNodes, indentLevel + 1);
        }
        str += `${indent}</g>\n`;
        return str;
      }
      case "rect":
        return `${indent}<rect ${commonAttrs} width="${node.width || 0}" height="${
          node.height || 0
        }" />\n`;
      case "circle":
        return `${indent}<circle ${commonAttrs} r="${node.radius || 0}" />\n`;
      case "ellipse":
        return `${indent}<ellipse ${commonAttrs} rx="${node.rx || 0}" ry="${
          node.ry || 0
        }" />\n`;
      case "line":
        return `${indent}<line ${commonAttrs} x1="${node.x1 || 0}" y1="${
          node.y1 || 0
        }" x2="${node.x2 || 0}" y2="${node.y2 || 0}" />\n`;
      case "polyline":
        return `${indent}<polyline ${commonAttrs} points="${
          node.points || ""
        }" />\n`;
      case "path":
        return `${indent}<path ${commonAttrs} d="${node.pathData || ""}" />\n`;
      case "image":
        return `${indent}<image ${commonAttrs} href="${node.src || ""}" width="${
          node.width || 0
        }" height="${node.height || 0}" />\n`;
      default:
        return "";
    }
  }
}
