import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore, createAssetRegistryStore } from '@monorepo/scene-graph';
import { Viewport } from './viewport';
import { TransformHandles } from './handles';
import { Matrix3 } from '@monorepo/math';
import { tokenizePath } from '@monorepo/serialization';

export class PixiBridge {
  private app: PIXI.Application;
  private viewport: Viewport;
  private handles: TransformHandles;
  private store: ReturnType<typeof createSceneGraphStore>;
  private assetRegistry: ReturnType<typeof createAssetRegistryStore>;
  private pixiNodes: Map<string, PIXI.Container | PIXI.Graphics | PIXI.Sprite> = new Map();
  private assetTextures: Map<string, PIXI.Texture> = new Map();

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof createSceneGraphStore>, assetRegistry: ReturnType<typeof createAssetRegistryStore>) {
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
    this.assetRegistry = assetRegistry;

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

    this.assetRegistry.subscribe((state) => {
      // Retrigger sync when assets update
      this.syncNodes(this.store.getState().nodes);
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
        } else if (node.type === 'image' || node.type === 'video') {
          pixiNode = new PIXI.Sprite();
          (pixiNode as PIXI.Sprite).anchor.set(0.5); // Center anchor for easy rotation/scaling
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
      } else if (pixiNode instanceof PIXI.Sprite) {
        if (node.assetId) {
          const asset = this.assetRegistry.getState().getAsset(node.assetId);
          if (asset) {
            if (asset.status === 'loading') {
              // Create a placeholder texture if not already created
              if (!this.assetTextures.has('placeholder')) {
                const graphics = new PIXI.Graphics();
                graphics.beginFill(0x888888);
                graphics.drawRect(0, 0, 100, 100);
                graphics.endFill();
                this.assetTextures.set('placeholder', this.app.renderer.generateTexture(graphics));
              }
              pixiNode.texture = this.assetTextures.get('placeholder')!;
              
              if (node.width && node.height) {
                pixiNode.width = node.width;
                pixiNode.height = node.height;
              }
            } else if (asset.status === 'ready' && asset.url) {
              if (!this.assetTextures.has(asset.url)) {
                // Determine if video or image
                if (asset.type === 'video') {
                  const texture = PIXI.Texture.from(asset.url);
                  const baseTex = texture.baseTexture.resource as PIXI.VideoResource;
                  if (baseTex.source) {
                    (baseTex.source as HTMLVideoElement).loop = true;
                    (baseTex.source as HTMLVideoElement).muted = true;
                    (baseTex.source as HTMLVideoElement).play();
                  }
                  this.assetTextures.set(asset.url, texture);
                } else {
                  this.assetTextures.set(asset.url, PIXI.Texture.from(asset.url));
                }
              }
              pixiNode.texture = this.assetTextures.get(asset.url)!;
              
              // Set sprite dimensions if specified, else use natural texture size
              if (node.width && node.height) {
                pixiNode.width = node.width;
                pixiNode.height = node.height;
              }
            }
          }
        }
      }

      this.applyMatrix(pixiNode, node.localMatrix);
    }
  }
}
