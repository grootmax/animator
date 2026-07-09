import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';
import { Viewport } from './viewport';
import { TransformHandles } from './handles';
import { tokenizePath } from '@monorepo/serialization';

export class PixiBridge {
  private app: PIXI.Application;
  private viewport: Viewport;
  private handles: TransformHandles;
  private store: ReturnType<typeof createSceneGraphStore>;
  private pixiNodes: Map<string, PIXI.Container | PIXI.Graphics> = new Map();

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

  private drawPath(graphics: PIXI.Graphics, pathData: string) {
    const tokens = tokenizePath(pathData);
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

        const viewportContainer = this.viewport.container;
        pixiNode.updateTransform = function(this: any) {
          this._boundsID++;
          
          const w = this.worldMatrix;
          if (w) {
            const v = viewportContainer.worldTransform;
            this.worldTransform.set(
              v.a * w[0] + v.c * w[1],
              v.b * w[0] + v.d * w[1],
              v.a * w[3] + v.c * w[4],
              v.b * w[3] + v.d * w[4],
              v.a * w[6] + v.c * w[7] + v.tx,
              v.b * w[6] + v.d * w[7] + v.ty
            );
          }
          
          this.worldAlpha = this.alpha * this.parent.worldAlpha;
          
          for (let i = 0, j = this.children.length; i < j; ++i) {
            const child = this.children[i];
            if (child.visible) {
              child.updateTransform();
            }
          }
        };

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
      }

      (pixiNode as any).worldMatrix = node.worldMatrix;
    }
  }
}
