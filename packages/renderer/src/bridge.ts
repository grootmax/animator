import * as PIXI from "pixi.js";
import { TransformHandles } from "./handles.js";
import type {
  Matrix3,
  PathToken,
  SceneGraphStore,
  SceneNode,
} from "./types.js";
import { tokenizePath } from "./types.js";
import { Viewport } from "./viewport.js";

interface SpriteWithSrc {
  _currentSrc?: string | undefined;
}

export class PixiBridge {
  private app: PIXI.Application;
  private viewport: Viewport;
  private handles: TransformHandles;
  private store: SceneGraphStore;
  private pixiNodes: Map<string, PIXI.Container | PIXI.Graphics> = new Map();
  private pathCache: Map<string, PathToken[]> = new Map();
  private remoteSelectionsContainer: PIXI.Container;

  constructor(app: PIXI.Application, store: SceneGraphStore) {
    this.app = app;
    this.store = store;
    this.viewport = new Viewport(this.app, this.store);
    this.handles = new TransformHandles(
      this.store,
      this.viewport,
      (id: string) => this.pixiNodes.get(id),
    );

    this.remoteSelectionsContainer = new PIXI.Container();
    this.remoteSelectionsContainer.zIndex = 999;
    this.viewport.container.addChild(this.remoteSelectionsContainer);

    this.viewport.container.addChild(this.handles.container);

    this.viewport.container.eventMode = "static";
    this.viewport.container.on("pointerdown", (e) => {
      if (e.target === this.viewport.container) {
        this.handles.setSelectedNode(null);
      }
    });

    let updateQueued = false;
    this.store.subscribe(() => {
      if (!updateQueued) {
        updateQueued = true;
        queueMicrotask(() => {
          updateQueued = false;
          const state = this.store.getState();
          this.syncNodes(state.nodes);
          this.handles.update();
        });
      }
    });

    this.app.ticker.add(() => {
      this.handles.update();
    });
  }

  private applyMatrix(displayObject: PIXI.Container, matrix: Matrix3) {
    const a = matrix[0] ?? 1;
    const b = matrix[1] ?? 0;
    const c = matrix[3] ?? 0;
    const d = matrix[4] ?? 1;
    const tx = matrix[6] ?? 0;
    const ty = matrix[7] ?? 0;

    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const cR = c * cosR + d * sinR;
    const dR = -c * sinR + d * cosR;

    const scaleY = Math.sqrt(cR * cR + dR * dR) * Math.sign(dR || 1);
    const skewX = Math.atan2(cR, dR);

    displayObject.setTransform(
      tx,
      ty,
      scaleX,
      scaleY,
      rotation,
      skewX,
      0,
      0,
      0,
    );
  }

  private drawPath(graphics: PIXI.Graphics, pathData: string) {
    let tokens = this.pathCache.get(pathData);
    if (!tokens) {
      tokens = tokenizePath(pathData);
      this.pathCache.set(pathData, tokens);
    }
    let x = 0;
    let y = 0;

    for (const t of tokens) {
      const p = t.args;
      switch (t.type) {
        case "M":
          x = p[0] ?? 0;
          y = p[1] ?? 0;
          graphics.moveTo(x, y);
          break;
        case "m":
          x += p[0] ?? 0;
          y += p[1] ?? 0;
          graphics.moveTo(x, y);
          break;
        case "L":
          x = p[0] ?? 0;
          y = p[1] ?? 0;
          graphics.lineTo(x, y);
          break;
        case "l":
          x += p[0] ?? 0;
          y += p[1] ?? 0;
          graphics.lineTo(x, y);
          break;
        case "H":
          x = p[0] ?? 0;
          graphics.lineTo(x, y);
          break;
        case "h":
          x += p[0] ?? 0;
          graphics.lineTo(x, y);
          break;
        case "V":
          y = p[0] ?? 0;
          graphics.lineTo(x, y);
          break;
        case "v":
          y += p[0] ?? 0;
          graphics.lineTo(x, y);
          break;
        case "C":
          graphics.bezierCurveTo(
            p[0] ?? 0,
            p[1] ?? 0,
            p[2] ?? 0,
            p[3] ?? 0,
            p[4] ?? 0,
            p[5] ?? 0,
          );
          x = p[4] ?? 0;
          y = p[5] ?? 0;
          break;
        case "c":
          graphics.bezierCurveTo(
            x + (p[0] ?? 0),
            y + (p[1] ?? 0),
            x + (p[2] ?? 0),
            y + (p[3] ?? 0),
            x + (p[4] ?? 0),
            y + (p[5] ?? 0),
          );
          x += p[4] ?? 0;
          y += p[5] ?? 0;
          break;
        case "Z":
        case "z":
          graphics.closePath();
          break;
      }
    }
  }

  private syncNodes(nodes: Record<string, SceneNode>) {
    const usedPaths = new Set<string>();

    for (const [id, node] of Object.entries(nodes)) {
      let pixiNode = this.pixiNodes.get(id);

      if (!pixiNode) {
        if (
          node.type === "rect" ||
          node.type === "circle" ||
          node.type === "path" ||
          node.type === "ellipse" ||
          node.type === "line" ||
          node.type === "polyline"
        ) {
          pixiNode = new PIXI.Graphics();
        } else if (node.type === "image") {
          pixiNode = new PIXI.Container();
          const sprite = new PIXI.Sprite();
          sprite.anchor.set(0.5);
          pixiNode.addChild(sprite);
        } else {
          pixiNode = new PIXI.Container();
        }

        pixiNode.eventMode = "static";
        pixiNode.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation();
          const n = this.store.getState().nodes[id];
          if (n && !n.locked && n.visible) {
            this.handles.setSelectedNode(id);
          }
        });

        this.pixiNodes.set(id, pixiNode);

        const parentNode = node.parentId
          ? this.pixiNodes.get(node.parentId)
          : undefined;
        if (parentNode) {
          parentNode.addChild(pixiNode);
        } else {
          this.viewport.container.addChild(pixiNode);
        }
      } else {
        const parentNode = node.parentId
          ? this.pixiNodes.get(node.parentId)
          : undefined;
        const expectedParent = parentNode ?? this.viewport.container;
        if (pixiNode.parent !== expectedParent) {
          expectedParent.addChild(pixiNode);
        }
      }

      pixiNode.visible = node.visible !== false;
      pixiNode.alpha = node.opacity !== undefined ? node.opacity : 1;

      if (pixiNode instanceof PIXI.Graphics) {
        pixiNode.clear();

        if (node.fill) {
          const fill = Number.parseInt(node.fill.replace("#", "0x"), 16) || 0;
          if (!Number.isNaN(fill)) {
            pixiNode.beginFill(fill);
          }
        }
        if (node.stroke) {
          const stroke =
            Number.parseInt(node.stroke.replace("#", "0x"), 16) || 0;
          const strokeWidth =
            node.strokeWidth !== undefined ? node.strokeWidth : 2;
          if (!Number.isNaN(stroke)) {
            pixiNode.lineStyle(strokeWidth, stroke);
          }
        }

        if (node.type === "rect" && node.width && node.height) {
          pixiNode.drawRect(
            -node.width / 2,
            -node.height / 2,
            node.width,
            node.height,
          );
        } else if (node.type === "circle" && node.radius) {
          pixiNode.drawCircle(0, 0, node.radius);
        } else if (node.type === "ellipse" && node.rx && node.ry) {
          pixiNode.drawEllipse(0, 0, node.rx, node.ry);
        } else if (node.type === "line") {
          pixiNode.moveTo(node.x1 || 0, node.y1 || 0);
          pixiNode.lineTo(node.x2 || 0, node.y2 || 0);
        } else if (node.type === "polyline" && node.points) {
          const pts = node.points
            .trim()
            .split(/[\s,]+/)
            .map(Number.parseFloat);
          if (pts.length >= 2) {
            pixiNode.moveTo(pts[0] ?? 0, pts[1] ?? 0);
            for (let i = 2; i < pts.length; i += 2) {
              pixiNode.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
            }
          }
        } else if (node.type === "path" && node.pathData) {
          usedPaths.add(node.pathData);
          this.drawPath(pixiNode, node.pathData);
        }

        if (node.fill) {
          pixiNode.endFill();
        }
      } else if (node.type === "image") {
        const sprite = (pixiNode as PIXI.Container).children[0] as PIXI.Sprite;
        const spriteWithSrc = sprite as unknown as SpriteWithSrc;

        if (node.src) {
          const currentSrc = spriteWithSrc._currentSrc;
          if (currentSrc !== node.src) {
            spriteWithSrc._currentSrc = node.src;
            const tex = PIXI.Texture.from(node.src);
            sprite.texture = tex;
          }
        } else {
          sprite.texture = PIXI.Texture.EMPTY;
          spriteWithSrc._currentSrc = undefined;
        }

        if (
          node.width !== undefined &&
          node.height !== undefined &&
          sprite.texture.valid
        ) {
          sprite.width = node.width;
          sprite.height = node.height;
        } else if (node.width === undefined || node.height === undefined) {
          sprite.scale.set(1);
        }
      }

      if (node.localMatrix) {
        this.applyMatrix(pixiNode, node.localMatrix);
      }
    }

    for (const path of this.pathCache.keys()) {
      if (!usedPaths.has(path)) {
        this.pathCache.delete(path);
      }
    }
  }
}
