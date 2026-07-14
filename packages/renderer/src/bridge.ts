import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';
import { Viewport } from './viewport';
import { TransformHandles } from './handles';
import { Matrix3 } from '@monorepo/math';
import { AsyncTextureCache } from './textureCache';

export class PixiBridge {
  private app: PIXI.Application;
  private viewport: Viewport;
  private handles: TransformHandles;
  private store: ReturnType<typeof createSceneGraphStore>;
  private pixiNodes: Map<string, PIXI.Container | PIXI.Graphics | PIXI.Sprite> = new Map();
  private cache: AsyncTextureCache;

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof createSceneGraphStore>) {
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      backgroundColor: 0x1a1a1a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.stage.sortableChildren = true;
    this.cache = new AsyncTextureCache(this.app);

    this.viewport = new Viewport(this.app);
    this.handles = new TransformHandles(store, this.viewport);

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

  private applyMatrix(displayObject: PIXI.Container, matrix: Matrix3, pivotX = 0, pivotY = 0) {
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
      pivotX, pivotY // pivot
    );
  }

  private syncNodes(nodes: Record<string, SceneNode>) {
    for (const [id, node] of Object.entries(nodes)) {
      let pixiNode = this.pixiNodes.get(id);

      if (!pixiNode) {
        if (node.type === 'rect' || node.type === 'circle' || node.type === 'ellipse' || node.type === 'line' || node.type === 'polyline') {
          pixiNode = new PIXI.Graphics();
        } else if (node.type === 'path' || node.type === 'image') {
          pixiNode = new PIXI.Sprite();
          (pixiNode as any)._customOffsetX = 0;
          (pixiNode as any)._customOffsetY = 0;
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
        }

        if (node.fill) {
            pixiNode.endFill();
        }
      } else if (pixiNode instanceof PIXI.Sprite) {
        if (node.assetId) {
          this.cache.getTextureForAsset(node.assetId, node).then((cached) => {
            if (cached && pixiNode instanceof PIXI.Sprite) {
              pixiNode.texture = cached.texture;
              (pixiNode as any)._customOffsetX = cached.offsetX;
              (pixiNode as any)._customOffsetY = cached.offsetY;
              
              // Re-apply matrix immediately since dimensions changed asynchronously
              const pX = -cached.offsetX;
              const pY = -cached.offsetY;
              this.applyMatrix(pixiNode, node.localMatrix, pX, pY);
            }
          });
        }
      }

      const pX = (pixiNode as any)._customOffsetX ? -(pixiNode as any)._customOffsetX : 0;
      const pY = (pixiNode as any)._customOffsetY ? -(pixiNode as any)._customOffsetY : 0;
      this.applyMatrix(pixiNode, node.localMatrix, pX, pY);
    }
  }
}
