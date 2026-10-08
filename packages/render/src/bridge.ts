import type {
  Canvas,
  CanvasKit,
  ManagedSkottieAnimation,
  Paint,
  Surface,
} from "canvaskit-wasm";
import { getCanvasKit } from "./canvaskit.js";
import type {
  CircleNode,
  EllipseNode,
  GroupNode,
  HandleType,
  ImageNode,
  LineNode,
  NodeBounds,
  PathNode,
  PolylineNode,
  RectangleNode,
  SceneNode,
  ViewportTransform,
} from "./nodeTypes.js";

export function parseColor(
  colorStr?: string,
  opacity = 1.0,
): [number, number, number, number] {
  if (!colorStr) {
    return [0, 0, 0, opacity];
  }
  let hex = colorStr.trim();
  if (hex.startsWith("#")) {
    hex = hex.substring(1);
  }
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (hex.length === 6) {
    const r = Number.parseInt(hex.substring(0, 2), 16) / 255;
    const g = Number.parseInt(hex.substring(2, 4), 16) / 255;
    const b = Number.parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b, opacity];
  }
  if (hex.length === 8) {
    const r = Number.parseInt(hex.substring(0, 2), 16) / 255;
    const g = Number.parseInt(hex.substring(2, 4), 16) / 255;
    const b = Number.parseInt(hex.substring(4, 6), 16) / 255;
    const a = (Number.parseInt(hex.substring(6, 8), 16) / 255) * opacity;
    return [r, g, b, a];
  }
  return [0, 0, 0, opacity];
}

export class CanvasKitBridge {
  private ck: CanvasKit | null = null;
  private surface: Surface | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private viewport: ViewportTransform = { panX: 0, panY: 0, zoom: 1 };
  private selectedNodeId: string | null = null;
  private lottieAnimation: ManagedSkottieAnimation | null = null;

  public static async create(): Promise<CanvasKitBridge> {
    const bridge = new CanvasKitBridge();
    await bridge.init();
    return bridge;
  }

  public async init(): Promise<void> {
    if (!this.ck) {
      this.ck = await getCanvasKit();
    }
  }

  public getCanvasKitInstance(): CanvasKit | null {
    return this.ck;
  }

  public bindSurface(canvas: HTMLCanvasElement): boolean {
    if (!this.ck) {
      return false;
    }
    this.canvasElement = canvas;
    if (typeof this.ck.MakeWebGLCanvasSurface === "function") {
      this.surface = this.ck.MakeWebGLCanvasSurface(canvas) || null;
    }
    if (!this.surface && typeof this.ck.MakeSWCanvasSurface === "function") {
      this.surface = this.ck.MakeSWCanvasSurface(canvas) || null;
    }
    if (!this.surface) {
      this.surface = this.ck.MakeSurface(canvas.width, canvas.height) || null;
    }
    return this.surface !== null;
  }

  public initSurface(width: number, height: number): boolean {
    if (!this.ck) {
      return false;
    }
    this.surface = this.ck.MakeSurface(width, height) || null;
    return this.surface !== null;
  }

  public setViewport(vp: Partial<ViewportTransform>): void {
    this.viewport = { ...this.viewport, ...vp };
  }

  public getViewport(): ViewportTransform {
    return { ...this.viewport };
  }

  public setSelectedNodeId(id: string | null): void {
    this.selectedNodeId = id;
  }

  public screenToScene(
    screenX: number,
    screenY: number,
  ): { x: number; y: number } {
    return {
      x: (screenX - this.viewport.panX) / this.viewport.zoom,
      y: (screenY - this.viewport.panY) / this.viewport.zoom,
    };
  }

  public sceneToScreen(
    sceneX: number,
    sceneY: number,
  ): { x: number; y: number } {
    return {
      x: sceneX * this.viewport.zoom + this.viewport.panX,
      y: sceneY * this.viewport.zoom + this.viewport.panY,
    };
  }

  public loadSkottieAnimation(
    lottieJsonStr: string,
  ): ManagedSkottieAnimation | null {
    if (!this.ck) return null;
    if (this.lottieAnimation) {
      this.lottieAnimation.delete();
      this.lottieAnimation = null;
    }
    this.lottieAnimation = this.ck.MakeManagedAnimation(lottieJsonStr);
    return this.lottieAnimation;
  }

  public renderSkottieFrame(
    frameNumber: number,
    width: number,
    height: number,
  ): void {
    if (!this.ck || !this.surface || !this.lottieAnimation) return;
    const canvas = this.surface.getCanvas();
    canvas.save();
    canvas.translate(this.viewport.panX, this.viewport.panY);
    canvas.scale(this.viewport.zoom, this.viewport.zoom);
    this.lottieAnimation.seekFrame(frameNumber);
    this.lottieAnimation.render(canvas, this.ck.LTRBRect(0, 0, width, height));
    canvas.restore();
    this.surface.flush();
  }

  public renderScene(nodes: SceneNode[], backgroundColorHex = "#0B1020"): void {
    if (!this.ck || !this.surface) return;
    const canvas = this.surface.getCanvas();

    // Clear background
    const bgPaint = new this.ck.Paint();
    const bgColor = parseColor(backgroundColorHex, 1.0);
    bgPaint.setColor(
      this.ck.Color4f(bgColor[0], bgColor[1], bgColor[2], bgColor[3]),
    );
    bgPaint.setStyle(this.ck.PaintStyle.Fill);

    const surfaceWidth = this.canvasElement ? this.canvasElement.width : 1080;
    const surfaceHeight = this.canvasElement ? this.canvasElement.height : 1080;
    canvas.drawRect(
      this.ck.LTRBRect(0, 0, surfaceWidth, surfaceHeight),
      bgPaint,
    );
    bgPaint.delete();

    // Apply Viewport transform (Pan & Zoom)
    canvas.save();
    canvas.translate(this.viewport.panX, this.viewport.panY);
    canvas.scale(this.viewport.zoom, this.viewport.zoom);

    // Render Scene Graph Nodes
    let selectedNode: SceneNode | null = null;
    for (const node of nodes) {
      if (node.visible === false) continue;
      this.renderNode(canvas, node);
      if (this.selectedNodeId && node.id === this.selectedNodeId) {
        selectedNode = node;
      }
    }

    // Render Transform Handles for selected node
    if (selectedNode) {
      this.renderTransformHandles(canvas, selectedNode);
    }

    canvas.restore();
    this.surface.flush();
  }

  public renderNode(canvas: Canvas, node: SceneNode): void {
    if (!this.ck) return;

    canvas.save();

    // Position & Transforms
    const posX = node.x ?? 0;
    const posY = node.y ?? 0;
    const rot = node.rotation ?? 0;
    const scaleX = node.scaleX ?? 1;
    const scaleY = node.scaleY ?? 1;
    const anchorX = node.anchorX ?? 0;
    const anchorY = node.anchorY ?? 0;

    canvas.translate(posX, posY);
    if (rot !== 0) {
      canvas.rotate(rot, 0, 0);
    }
    if (scaleX !== 1 || scaleY !== 1) {
      canvas.scale(scaleX, scaleY);
    }
    if (anchorX !== 0 || anchorY !== 0) {
      canvas.translate(-anchorX, -anchorY);
    }

    const opacity = node.opacity ?? 1.0;

    // Fill Paint
    let fillPaint: Paint | null = null;
    if (node.fill) {
      fillPaint = new this.ck.Paint();
      fillPaint.setAntiAlias(true);
      fillPaint.setStyle(this.ck.PaintStyle.Fill);
      const fillOpacity = (node.fillOpacity ?? 1.0) * opacity;
      const fc = parseColor(node.fill, fillOpacity);
      fillPaint.setColor(this.ck.Color4f(fc[0], fc[1], fc[2], fc[3]));
    }

    // Stroke Paint
    let strokePaint: Paint | null = null;
    if (node.strokeColor && (node.strokeWidth ?? 1) > 0) {
      strokePaint = new this.ck.Paint();
      strokePaint.setAntiAlias(true);
      strokePaint.setStyle(this.ck.PaintStyle.Stroke);
      strokePaint.setStrokeWidth(node.strokeWidth ?? 1);
      const strokeOpacity = (node.strokeOpacity ?? 1.0) * opacity;
      const sc = parseColor(node.strokeColor, strokeOpacity);
      strokePaint.setColor(this.ck.Color4f(sc[0], sc[1], sc[2], sc[3]));

      if (node.strokeCap === "round")
        strokePaint.setStrokeCap(this.ck.StrokeCap.Round);
      else if (node.strokeCap === "square")
        strokePaint.setStrokeCap(this.ck.StrokeCap.Square);
      else strokePaint.setStrokeCap(this.ck.StrokeCap.Butt);

      if (node.strokeJoin === "round")
        strokePaint.setStrokeJoin(this.ck.StrokeJoin.Round);
      else if (node.strokeJoin === "bevel")
        strokePaint.setStrokeJoin(this.ck.StrokeJoin.Bevel);
      else strokePaint.setStrokeJoin(this.ck.StrokeJoin.Miter);
    }

    // Draw Primitives according to node type
    switch (node.type) {
      case "rectangle":
      case "rect": {
        const rectNode = node as RectangleNode;
        const rect = this.ck.LTRBRect(0, 0, rectNode.width, rectNode.height);
        if (rectNode.cornerRadius && rectNode.cornerRadius > 0) {
          const rrect = this.ck.RRectXY(
            rect,
            rectNode.cornerRadius,
            rectNode.cornerRadius,
          );
          if (fillPaint) canvas.drawRRect(rrect, fillPaint);
          if (strokePaint) canvas.drawRRect(rrect, strokePaint);
        } else {
          if (fillPaint) canvas.drawRect(rect, fillPaint);
          if (strokePaint) canvas.drawRect(rect, strokePaint);
        }
        break;
      }
      case "circle": {
        const circleNode = node as CircleNode;
        if (fillPaint) canvas.drawCircle(0, 0, circleNode.radius, fillPaint);
        if (strokePaint)
          canvas.drawCircle(0, 0, circleNode.radius, strokePaint);
        break;
      }
      case "ellipse": {
        const ellipseNode = node as EllipseNode;
        const rect = this.ck.LTRBRect(
          -ellipseNode.radiusX,
          -ellipseNode.radiusY,
          ellipseNode.radiusX,
          ellipseNode.radiusY,
        );
        if (fillPaint) canvas.drawOval(rect, fillPaint);
        if (strokePaint) canvas.drawOval(rect, strokePaint);
        break;
      }
      case "path": {
        const pathNode = node as PathNode;
        if (pathNode.d) {
          const skPath =
            typeof this.ck.Path.MakeFromSVGString === "function"
              ? this.ck.Path.MakeFromSVGString(pathNode.d)
              : null;
          if (skPath) {
            if (fillPaint) canvas.drawPath(skPath, fillPaint);
            if (strokePaint) canvas.drawPath(skPath, strokePaint);
            skPath.delete();
          }
        }
        break;
      }
      case "line": {
        const lineNode = node as LineNode;
        if (strokePaint) {
          canvas.drawLine(
            lineNode.x1,
            lineNode.y1,
            lineNode.x2,
            lineNode.y2,
            strokePaint,
          );
        }
        break;
      }
      case "polyline": {
        const polylineNode = node as PolylineNode;
        if (polylineNode.points && polylineNode.points.length > 0) {
          const d = polylineNode.points
            .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
            .join(" ");
          const skPath =
            typeof this.ck.Path.MakeFromSVGString === "function"
              ? this.ck.Path.MakeFromSVGString(d)
              : null;
          if (skPath) {
            if (fillPaint) canvas.drawPath(skPath, fillPaint);
            if (strokePaint) canvas.drawPath(skPath, strokePaint);
            skPath.delete();
          }
        }
        break;
      }
      case "image": {
        const imgNode = node as ImageNode;
        if (imgNode.imageBytes) {
          const img = this.ck.MakeImageFromEncoded(imgNode.imageBytes);
          if (img) {
            const srcRect = this.ck.LTRBRect(0, 0, img.width(), img.height());
            const dstRect = this.ck.LTRBRect(
              0,
              0,
              imgNode.width,
              imgNode.height,
            );
            const imgPaint = fillPaint || new this.ck.Paint();
            canvas.drawImageRect(img, srcRect, dstRect, imgPaint);
            img.delete();
            if (!fillPaint) imgPaint.delete();
          }
        } else {
          // Placeholder rect for image
          const placeholderPaint = new this.ck.Paint();
          placeholderPaint.setStyle(this.ck.PaintStyle.Stroke);
          placeholderPaint.setColor(this.ck.Color4f(0.3, 0.6, 0.9, 0.8));
          placeholderPaint.setStrokeWidth(2);
          canvas.drawRect(
            this.ck.LTRBRect(0, 0, imgNode.width, imgNode.height),
            placeholderPaint,
          );
          placeholderPaint.delete();
        }
        break;
      }
      case "group": {
        const groupNode = node as GroupNode;
        if (groupNode.children) {
          for (const child of groupNode.children) {
            this.renderNode(canvas, child);
          }
        }
        break;
      }
    }

    if (fillPaint) fillPaint.delete();
    if (strokePaint) strokePaint.delete();

    canvas.restore();
  }

  public calculateNodeBounds(node: SceneNode): NodeBounds {
    switch (node.type) {
      case "rectangle":
      case "rect": {
        const n = node as RectangleNode;
        return { x: 0, y: 0, width: n.width, height: n.height };
      }
      case "circle": {
        const n = node as CircleNode;
        return {
          x: -n.radius,
          y: -n.radius,
          width: n.radius * 2,
          height: n.radius * 2,
        };
      }
      case "ellipse": {
        const n = node as EllipseNode;
        return {
          x: -n.radiusX,
          y: -n.radiusY,
          width: n.radiusX * 2,
          height: n.radiusY * 2,
        };
      }
      case "line": {
        const n = node as LineNode;
        const minX = Math.min(n.x1, n.x2);
        const minY = Math.min(n.y1, n.y2);
        const maxX = Math.max(n.x1, n.x2);
        const maxY = Math.max(n.y1, n.y2);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      case "image": {
        const n = node as ImageNode;
        return { x: 0, y: 0, width: n.width, height: n.height };
      }
      default: {
        return { x: 0, y: 0, width: 100, height: 100 };
      }
    }
  }

  public renderTransformHandles(canvas: Canvas, node: SceneNode): void {
    if (!this.ck) return;

    canvas.save();

    const posX = node.x ?? 0;
    const posY = node.y ?? 0;
    const rot = node.rotation ?? 0;
    const scaleX = node.scaleX ?? 1;
    const scaleY = node.scaleY ?? 1;

    canvas.translate(posX, posY);
    if (rot !== 0) canvas.rotate(rot, 0, 0);
    if (scaleX !== 1 || scaleY !== 1) canvas.scale(scaleX, scaleY);

    const bounds = this.calculateNodeBounds(node);

    // Selection Bounding Box Paint
    const boxPaint = new this.ck.Paint();
    boxPaint.setStyle(this.ck.PaintStyle.Stroke);
    boxPaint.setColor(this.ck.Color4f(0.18, 0.53, 0.94, 1.0)); // Accent blue
    boxPaint.setStrokeWidth(2 / this.viewport.zoom);
    boxPaint.setAntiAlias(true);

    const rect = this.ck.LTRBRect(
      bounds.x,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    );
    canvas.drawRect(rect, boxPaint);

    // Handle Paint (Fill & Border)
    const handleFillPaint = new this.ck.Paint();
    handleFillPaint.setStyle(this.ck.PaintStyle.Fill);
    handleFillPaint.setColor(this.ck.Color4f(1, 1, 1, 1));
    handleFillPaint.setAntiAlias(true);

    const handleStrokePaint = new this.ck.Paint();
    handleStrokePaint.setStyle(this.ck.PaintStyle.Stroke);
    handleStrokePaint.setColor(this.ck.Color4f(0.18, 0.53, 0.94, 1.0));
    handleStrokePaint.setStrokeWidth(2 / this.viewport.zoom);
    handleStrokePaint.setAntiAlias(true);

    const handleSize = 8 / this.viewport.zoom;

    // Corner handles (nw, ne, se, sw)
    const handles = [
      { type: "nw", x: bounds.x, y: bounds.y },
      { type: "ne", x: bounds.x + bounds.width, y: bounds.y },
      { type: "se", x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { type: "sw", x: bounds.x, y: bounds.y + bounds.height },
    ];

    for (const h of handles) {
      const hRect = this.ck.LTRBRect(
        h.x - handleSize / 2,
        h.y - handleSize / 2,
        h.x + handleSize / 2,
        h.y + handleSize / 2,
      );
      canvas.drawRect(hRect, handleFillPaint);
      canvas.drawRect(hRect, handleStrokePaint);
    }

    // Rotation Handle (top center)
    const rotX = bounds.x + bounds.width / 2;
    const rotY = bounds.y - 24 / this.viewport.zoom;
    canvas.drawLine(rotX, bounds.y, rotX, rotY, boxPaint);
    canvas.drawCircle(rotX, rotY, handleSize / 2, handleFillPaint);
    canvas.drawCircle(rotX, rotY, handleSize / 2, handleStrokePaint);

    boxPaint.delete();
    handleFillPaint.delete();
    handleStrokePaint.delete();

    canvas.restore();
  }

  public destroy(): void {
    if (this.lottieAnimation) {
      this.lottieAnimation.delete();
      this.lottieAnimation = null;
    }
    if (this.surface) {
      this.surface.delete();
      this.surface = null;
    }
  }
}
