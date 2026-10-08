import { type Matrix3, createMatrix, multiplyMatrix } from "@monorepo/math";
import type { NodeType, SceneNode } from "@monorepo/scene-graph";
import { DOMParser as XMLDOMParser } from "@xmldom/xmldom";

const DOMParserClass =
  typeof DOMParser !== "undefined"
    ? DOMParser
    : (XMLDOMParser as unknown as typeof DOMParser);

let idCounter = 0;
const generateId = () => `node_${idCounter++}`;

export class SvgParser {
  private calculateViewBoxTransform(svgElement: Element): Matrix3 {
    const matrix: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    const viewBox = svgElement.getAttribute("viewBox");
    const widthAttr = svgElement.getAttribute("width");
    const heightAttr = svgElement.getAttribute("height");

    if (!viewBox) return matrix;

    const vbParts = viewBox
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number.parseFloat);
    if (vbParts.length !== 4 || vbParts.some(Number.isNaN)) return matrix;

    const [minX, minY, vbWidth, vbHeight] = vbParts;
    if (vbWidth <= 0 || vbHeight <= 0) return matrix;

    let w = vbWidth;
    let h = vbHeight;

    if (widthAttr && !widthAttr.endsWith("%")) {
      w = Number.parseFloat(widthAttr) || vbWidth;
    }
    if (heightAttr && !heightAttr.endsWith("%")) {
      h = Number.parseFloat(heightAttr) || vbHeight;
    }

    const preserveAspectRatio =
      svgElement.getAttribute("preserveAspectRatio") || "xMidYMid meet";
    const parts = preserveAspectRatio.trim().split(/[\s]+/);
    const align = parts[0] || "xMidYMid";
    const meetOrSlice = parts[1] || "meet";

    let scaleX = w / vbWidth;
    let scaleY = h / vbHeight;

    if (align !== "none") {
      const uniformScale =
        meetOrSlice === "slice"
          ? Math.max(scaleX, scaleY)
          : Math.min(scaleX, scaleY);
      scaleX = uniformScale;
      scaleY = uniformScale;
    }

    let translateX = 0;
    let translateY = 0;

    if (align !== "none") {
      const xAlign = align.includes("xMin")
        ? "Min"
        : align.includes("xMax")
          ? "Max"
          : "Mid";
      const yAlign = align.includes("yMin")
        ? "Min"
        : align.includes("yMax")
          ? "Max"
          : "Mid";

      const extraWidth = w - vbWidth * scaleX;
      if (xAlign === "Mid") translateX = extraWidth / 2;
      else if (xAlign === "Max") translateX = extraWidth;

      const extraHeight = h - vbHeight * scaleY;
      if (yAlign === "Mid") translateY = extraHeight / 2;
      else if (yAlign === "Max") translateY = extraHeight;
    }

    return [
      scaleX,
      0,
      0,
      0,
      scaleY,
      0,
      translateX - minX * scaleX,
      translateY - minY * scaleY,
      1,
    ];
  }

  public parse(svgString: string): SceneNode[] {
    const parser = new DOMParserClass();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    const parserError =
      typeof doc.querySelector === "function"
        ? doc.querySelector("parsererror")
        : doc.getElementsByTagName("parsererror")[0] ||
          doc.getElementsByTagName("parserError")[0];

    if (parserError) {
      throw new Error("Invalid SVG string");
    }

    const svgElement = doc.documentElement;
    const rootNodes: SceneNode[] = [];
    const viewportMatrix = this.calculateViewBoxTransform(svgElement);

    const lastOrder = null;
    for (const child of Array.from(svgElement.children)) {
      this.processElement(child, null, rootNodes, viewportMatrix);
    }

    return rootNodes;
  }

  private parseTransform(transformStr: string): Matrix3 {
    let matrix = createMatrix();
    if (!transformStr) return matrix;

    const transforms = transformStr.match(/(\w+)\(([^)]+)\)/g) || [];

    for (const transform of transforms) {
      const match = transform.match(/(\w+)\(([^)]+)\)/);
      if (!match) continue;

      const type = match[1];
      const args = match[2].split(/[ ,]+/).map(Number.parseFloat);

      if (type === "matrix" && args.length === 6) {
        // [a, b, c, d, e, f] to Matrix3
        const [a, b, c, d, e, f] = args;
        const localMatrix: Matrix3 = [a, b, 0, c, d, 0, e, f, 1];
        matrix = multiplyMatrix(matrix, localMatrix);
      } else if (type === "translate" && args.length >= 1) {
        const tx = args[0];
        const ty = args.length > 1 ? args[1] : 0;
        const translateMatrix: Matrix3 = [1, 0, 0, 0, 1, 0, tx, ty, 1];
        matrix = multiplyMatrix(matrix, translateMatrix);
      } else if (type === "scale" && args.length >= 1) {
        const sx = args[0];
        const sy = args.length > 1 ? args[1] : sx;
        const scaleMatrix: Matrix3 = [sx, 0, 0, 0, sy, 0, 0, 0, 1];
        matrix = multiplyMatrix(matrix, scaleMatrix);
      } else if (type === "rotate" && args.length >= 1) {
        const angle = (args[0] * Math.PI) / 180;
        const cx = args.length === 3 ? args[1] : 0;
        const cy = args.length === 3 ? args[2] : 0;
        let rotateMatrix: Matrix3 = [
          Math.cos(angle),
          Math.sin(angle),
          0,
          -Math.sin(angle),
          Math.cos(angle),
          0,
          0,
          0,
          1,
        ];
        if (cx !== 0 || cy !== 0) {
          const tToCenter: Matrix3 = [1, 0, 0, 0, 1, 0, cx, cy, 1];
          const tBack: Matrix3 = [1, 0, 0, 0, 1, 0, -cx, -cy, 1];
          rotateMatrix = multiplyMatrix(
            tToCenter,
            multiplyMatrix(rotateMatrix, tBack),
          );
        }
        matrix = multiplyMatrix(matrix, rotateMatrix);
      }
    }

    return matrix;
  }

  private extractTransformProperties(matrix: Matrix3) {
    const a = matrix[0];
    const b = matrix[1];
    const c = matrix[3];
    const d = matrix[4];
    const x = matrix[6];
    const y = matrix[7];

    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    // Rotate [c, d] back by -rotation
    const cR = c * cosR + d * sinR;
    const dR = -c * sinR + d * cosR;

    const scaleY = Math.sqrt(cR * cR + dR * dR) * Math.sign(dR || 1);
    const skewX = Math.atan2(cR, dR);
    const skewY = 0;

    return { x, y, scaleX, scaleY, rotation, skewX, skewY };
  }

  private processElement(
    element: Element,
    parentId: string | null,
    nodesList: SceneNode[],
    parentMatrix: Matrix3,
  ) {
    const id = element.getAttribute("id") || element.id || generateId();
    let type: NodeType = "group";

    const tagName = element.tagName.toLowerCase();
    if (
      ![
        "g",
        "svg",
        "symbol",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "path",
        "image",
      ].includes(tagName)
    ) {
      // Recurse into unsupported tags like <defs> without creating a SceneNode for them
      for (const child of Array.from(element.children)) {
        this.processElement(child, parentId, nodesList, parentMatrix);
      }
      return;
    }

    switch (tagName) {
      case "g":
      case "svg":
      case "symbol":
        type = "group";
        break;
      case "rect":
        type = "rect";
        break;
      case "circle":
        type = "circle";
        break;
      case "ellipse":
        type = "ellipse";
        break;
      case "line":
        type = "line";
        break;
      case "polyline":
        type = "polyline";
        break;
      case "path":
        type = "path";
        break;
      case "image":
        type = "image";
        break;
      default:
        return; // Ignore unsupported
    }

    const transformStr = element.getAttribute("transform") || "";
    const localTransformMatrix = this.parseTransform(transformStr);

    let xAttr = Number.parseFloat(element.getAttribute("x") || "0");
    let yAttr = Number.parseFloat(element.getAttribute("y") || "0");
    if (Number.isNaN(xAttr)) xAttr = 0;
    if (Number.isNaN(yAttr)) yAttr = 0;
    let width = 0;
    let height = 0;

    if (type === "rect" || type === "image") {
      const wRaw = Number.parseFloat(element.getAttribute("width") || "0");
      const hRaw = Number.parseFloat(element.getAttribute("height") || "0");
      width = Number.isNaN(wRaw) ? 0 : wRaw;
      height = Number.isNaN(hRaw) ? 0 : hRaw;
      xAttr += width / 2;
      yAttr += height / 2;
    } else if (type === "circle" || type === "ellipse") {
      xAttr = Number.parseFloat(element.getAttribute("cx") || "0");
      yAttr = Number.parseFloat(element.getAttribute("cy") || "0");
      if (Number.isNaN(xAttr)) xAttr = 0;
      if (Number.isNaN(yAttr)) yAttr = 0;
    } else if (tagName === "line") {
      xAttr = 0;
      yAttr = 0;
    }

    const baseMatrix: Matrix3 = [1, 0, 0, 0, 1, 0, xAttr, yAttr, 1];

    const localMatrix = multiplyMatrix(localTransformMatrix, baseMatrix);
    const combinedMatrix =
      parentId === null
        ? multiplyMatrix(parentMatrix, localMatrix)
        : localMatrix;

    const { x, y, scaleX, scaleY, rotation, skewX, skewY } =
      this.extractTransformProperties(combinedMatrix);

    const opacityStr = element.getAttribute("opacity");
    const visibilityStr = element.getAttribute("visibility");
    const strokeWidthStr = element.getAttribute("stroke-width");

    const node: Partial<SceneNode> = {
      id,
      name: element.getAttribute("id") || element.id || type,
      type,
      parentId,
      order: "",
      x,
      y,
      scaleX,
      scaleY,
      rotation,
      skewX,
      skewY,
      fill: element.getAttribute("fill") || undefined,
      stroke: element.getAttribute("stroke") || undefined,
      opacity: opacityStr !== null ? Number.parseFloat(opacityStr) : 1,
      visible: visibilityStr !== "hidden",
      strokeWidth:
        strokeWidthStr !== null ? Number.parseFloat(strokeWidthStr) : undefined,
    };

    if (type === "rect" || type === "image") {
      const wRaw = Number.parseFloat(element.getAttribute("width") || "0");
      const hRaw = Number.parseFloat(element.getAttribute("height") || "0");
      node.width = Number.isNaN(wRaw) ? 0 : wRaw;
      node.height = Number.isNaN(hRaw) ? 0 : hRaw;
    }
    if (type === "image") {
      node.src =
        element.getAttribute("href") ||
        element.getAttribute("xlink:href") ||
        "";
    } else if (type === "circle") {
      node.radius = Number.parseFloat(element.getAttribute("r") || "0");
      if (Number.isNaN(node.radius)) node.radius = 0;
    } else if (type === "ellipse") {
      node.rx = Number.parseFloat(element.getAttribute("rx") || "0");
      node.ry = Number.parseFloat(element.getAttribute("ry") || "0");
      if (Number.isNaN(node.rx)) node.rx = 0;
      if (Number.isNaN(node.ry)) node.ry = 0;
    } else if (type === "line") {
      node.x1 = Number.parseFloat(element.getAttribute("x1") || "0");
      node.y1 = Number.parseFloat(element.getAttribute("y1") || "0");
      node.x2 = Number.parseFloat(element.getAttribute("x2") || "0");
      node.y2 = Number.parseFloat(element.getAttribute("y2") || "0");
    } else if (type === "polyline") {
      node.points = element.getAttribute("points") || "";
    } else if (type === "path") {
      if (tagName === "path") {
        node.pathData = element.getAttribute("d") || "";
      } else if (tagName === "ellipse") {
        const rx = Number.parseFloat(element.getAttribute("rx") || "0");
        const ry = Number.parseFloat(element.getAttribute("ry") || "0");
        node.pathData = `M ${-rx},0 a ${rx},${ry} 0 1,0 ${2 * rx},0 a ${rx},${ry} 0 1,0 ${-2 * rx},0`;
      } else if (tagName === "line") {
        const x1 = Number.parseFloat(element.getAttribute("x1") || "0");
        const y1 = Number.parseFloat(element.getAttribute("y1") || "0");
        const x2 = Number.parseFloat(element.getAttribute("x2") || "0");
        const y2 = Number.parseFloat(element.getAttribute("y2") || "0");
        node.pathData = `M ${x1},${y1} L ${x2},${y2}`;
      }
    }

    const sceneNode = node as SceneNode;
    nodesList.push(sceneNode);

    for (const child of Array.from(element.children)) {
      this.processElement(child, id, nodesList, combinedMatrix);
    }
  }
}
