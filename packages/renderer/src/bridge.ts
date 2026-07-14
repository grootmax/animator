import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';
import { Viewport } from './viewport';
import { TransformHandles } from './handles';
import { Matrix3 } from '@monorepo/math';
import { tokenizePath } from '@monorepo/serialization';

export class PixiBridge {
  private app: PIXI.Application;
  private viewport: Viewport;
  private handles: TransformHandles;
  private store: ReturnType<typeof createSceneGraphStore>;
  private pixiNodes: Map<string, PIXI.Container | PIXI.Graphics> = new Map();
  private visualCache: Map<string, Partial<SceneNode>> = new Map();
  private pathTokenCache: Map<string, ReturnType<typeof tokenizePath>> = new Map();

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof createSceneGraphStore>) {
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      backgroundColor: 0x1a1a1a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.stage.sortableChildren = true;

    this.viewport = new Viewport(this.app);
    this.handles = new TransformHandles(store, this.viewport);

    // Add handles directly to the viewport so they pan and zoom with the nodes!
    this.viewport.container.addChild(this.handles.container);

    this.store = store;

    this.viewport.container.interactive = true;
    this.viewport.container.on('pointerdown', (e) => {
      if (e.target === this.viewport.container) {
         this.handles.setSelectedNode(null);
      }
    });

    this.store.subscribe((state) => {
      this.syncNodes(state.nodes);
      this.handles.update();
    });

    this.app.ticker.add(() => {
        this.handles.update();
    });
  }

  private applyMatrix(displayObject: PIXI.Container, matrix: Matrix3) {
    const a = matrix[0], b = matrix[1], c = matrix[3], d = matrix[4], tx = matrix[6], ty = matrix[7];
    
    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);
    
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const cR = c * cosR + d * sinR;
    const dR = -c * sinR + d * cosR;
    
    const scaleY = Math.sqrt(cR * cR + dR * dR) * Math.sign(dR || 1);
    const skewX = Math.atan2(cR, dR);
    
    displayObject.setTransform(
      tx, ty, 
      scaleX, scaleY, 
      rotation, 
      skewX, 0, // skewX, skewY
      0, 0 // pivot
    );
  }

  private drawPath(graphics: PIXI.Graphics, pathData: string) {
    let tokens = this.pathTokenCache.get(pathData);
    if (!tokens) {
      tokens = tokenizePath(pathData);
      this.pathTokenCache.set(pathData, tokens);
    }
    let x = 0, y = 0;

    for (const t of tokens) {
      const p = t.args;
      switch (t.type) {
        case 'M': x = p[0]; y = p[1]; graphics.moveTo(x, y); break;
        case 'm': x += p[0]; y += p[1]; graphics.moveTo(x, y); break;
        case 'L': x = p[0]; y = p[1]; graphics.lineTo(x, y); break;
        case 'l': x += p[0]; y += p[1]; graphics.lineTo(x, y); break;
        case 'H': x = p[0]; graphics.lineTo(x, y); break;
        case 'h': x += p[0]; graphics.lineTo(x, y); break;
        case 'V': y = p[0]; graphics.lineTo(x, y); break;
        case 'v': y += p[0]; graphics.lineTo(x, y); break;
        case 'C':
          graphics.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
          x = p[4]; y = p[5];
          break;
        case 'c':
          graphics.bezierCurveTo(x+p[0], y+p[1], x+p[2], y+p[3], x+p[4], y+p[5]);
          x += p[4]; y += p[5];
          break;
        case 'Z': case 'z':
          graphics.closePath();
          break;
      }
    }
  }

  private syncNodes(nodes: Record<string, SceneNode>) {
    for (const [id, node] of Object.entries(nodes)) {
      let pixiNode = this.pixiNodes.get(id);

      if (!pixiNode) {
        if (node.type === 'rect' || node.type === 'circle' || node.type === 'path' || node.type === 'ellipse' || node.type === 'line' || node.type === 'polyline') {
          pixiNode = new PIXI.Graphics();
        } else {
          pixiNode = new PIXI.Container();
        }

        pixiNode.interactive = true;
        pixiNode.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            const n = this.store.getState().nodes[id];
            if (n && !n.locked && n.visible) {
              this.handles.setSelectedNode(id);
            }
        });

        this.pixiNodes.set(id, pixiNode);

        if (node.parentId && this.pixiNodes.has(node.parentId)) {
          this.pixiNodes.get(node.parentId)!.addChild(pixiNode);
        } else {
          this.viewport.container.addChild(pixiNode);
        }
      }

      // Update visibility and opacity
      pixiNode.visible = node.visible !== false;
      pixiNode.alpha = node.opacity !== undefined ? node.opacity : 1;

      if (pixiNode instanceof PIXI.Graphics) {
        const prev = this.visualCache.get(id);
        const hasVisualChange = !prev || 
          prev.type !== node.type ||
          prev.fill !== node.fill ||
          prev.stroke !== node.stroke ||
          prev.strokeWidth !== node.strokeWidth ||
          prev.width !== node.width ||
          prev.height !== node.height ||
          prev.radius !== node.radius ||
          prev.rx !== node.rx ||
          prev.ry !== node.ry ||
          prev.x1 !== node.x1 ||
          prev.y1 !== node.y1 ||
          prev.x2 !== node.x2 ||
          prev.y2 !== node.y2 ||
          prev.points !== node.points ||
          prev.pathData !== node.pathData;

        if (hasVisualChange) {
          pixiNode.clear();

          if (node.fill) {
              const fill = parseInt(node.fill.replace('#', '0x'));
              pixiNode.beginFill(fill);
          }
          if (node.stroke) {
              const stroke = parseInt(node.stroke.replace('#', '0x'));
              const strokeWidth = node.strokeWidth !== undefined ? node.strokeWidth : 2;
              pixiNode.lineStyle(strokeWidth, stroke);
          }

          if (node.type === 'rect' && node.width && node.height) {
            pixiNode.drawRect(-node.width/2, -node.height/2, node.width, node.height);
          } else if (node.type === 'circle' && node.radius) {
            pixiNode.drawCircle(0, 0, node.radius);
          } else if (node.type === 'ellipse' && node.rx && node.ry) {
            pixiNode.drawEllipse(0, 0, node.rx, node.ry);
          } else if (node.type === 'line') {
            pixiNode.moveTo(node.x1 || 0, node.y1 || 0);
            pixiNode.lineTo(node.x2 || 0, node.y2 || 0);
          } else if (node.type === 'polyline' && node.points) {
            const pts = node.points.trim().split(/[\s,]+/).map(parseFloat);
            if (pts.length >= 2) {
              pixiNode.moveTo(pts[0], pts[1]);
              for (let i = 2; i < pts.length; i += 2) {
                  pixiNode.lineTo(pts[i], pts[i+1]);
              }
            }
          } else if (node.type === 'path' && node.pathData) {
            this.drawPath(pixiNode, node.pathData);
          }

          if (node.fill) {
              pixiNode.endFill();
          }

          this.visualCache.set(id, {
            type: node.type, fill: node.fill, stroke: node.stroke, strokeWidth: node.strokeWidth,
            width: node.width, height: node.height, radius: node.radius, rx: node.rx, ry: node.ry,
            x1: node.x1, y1: node.y1, x2: node.x2, y2: node.y2, points: node.points, pathData: node.pathData
          });
        }
      }

      this.applyMatrix(pixiNode, node.localMatrix);
    }
  }
}
