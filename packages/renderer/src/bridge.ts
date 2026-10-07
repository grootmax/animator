import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';
import { Viewport } from './viewport';
import { TransformHandles } from './handles';
import { Matrix3 } from '@monorepo/math';
import { tokenizePath, PathToken } from '@monorepo/serialization';

export class PixiBridge {
  private app: PIXI.Application;
  private viewport: Viewport;
  private handles: TransformHandles;
  private store: ReturnType<typeof createSceneGraphStore>;
  private pixiNodes: Map<string, PIXI.Container | PIXI.Graphics> = new Map();
  private pathCache: Map<string, PathToken[]> = new Map();
  private remoteSelectionsContainer: PIXI.Container;

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof createSceneGraphStore>, _isWorker: boolean = false) {
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      backgroundColor: 0x1a1a1a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.stage.sortableChildren = true;

    this.viewport = new Viewport(this.app, store);
    this.handles = new TransformHandles(store, this.viewport, (id) => this.pixiNodes.get(id));

    this.remoteSelectionsContainer = new PIXI.Container();
    this.remoteSelectionsContainer.zIndex = 999;
    this.viewport.container.addChild(this.remoteSelectionsContainer);

    // Add handles directly to the viewport so they pan and zoom with the nodes!
    this.viewport.container.addChild(this.handles.container);

    this.store = store;

    this.viewport.container.interactive = true;
    this.viewport.container.on('pointerdown', (e) => {
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
        this.updateMediaVisibility();
        this.updateMediaPlayback();
    });
  }

  private getMaterialHash(node: SceneNode): string {
    if (node.type === 'container' || node.type === 'group') return 'container';
    return `${node.fill || 'none'}_${node.stroke || 'none'}_${node.strokeWidth || 0}`;
  }

  private updateMediaVisibility() {
    const screenBounds = new PIXI.Rectangle(0, 0, this.app.screen.width, this.app.screen.height);

    for (const [id, node] of Object.entries(this.store.getState().nodes)) {
      if (node.type === 'media') {
        const pixiNode = this.pixiNodes.get(id) as PIXI.Container;
        if (!pixiNode) continue;

        const bounds = pixiNode.getBounds();
        const isVisible = node.visible &&
          bounds.x < screenBounds.width && bounds.x + bounds.width > 0 &&
          bounds.y < screenBounds.height && bounds.y + bounds.height > 0;

        let mediaData = (pixiNode as any).mediaData;
        if (!mediaData) {
            mediaData = { state: 'unloaded', src: null, texture: null };
            (pixiNode as any).mediaData = mediaData;
        }

        if (isVisible && node.src) {
          if (mediaData.src !== node.src) {
             mediaData.state = 'unloaded';
             mediaData.src = node.src;
             (pixiNode as any).mediaSprite.texture = PIXI.Texture.EMPTY;
             (pixiNode as any).mediaPlaceholder.visible = true;
          }
          if (mediaData.state === 'unloaded') {
            mediaData.state = 'loading';
            PIXI.Assets.load(node.src).then(texture => {
              if (mediaData.src === node.src) {
                mediaData.state = 'loaded';
                mediaData.texture = texture;
                const sprite = (pixiNode as any).mediaSprite;
                sprite.texture = texture;
                
                (pixiNode as any).mediaPlaceholder.visible = false;
                
                this.syncVideoState(node, texture);
              }
            }).catch(e => {
              console.error("Failed to load media", e);
              if (mediaData.src === node.src) {
                  mediaData.state = 'error';
                  (pixiNode as any).mediaPlaceholder.visible = true;
              }
            });
          }
        } else if (!isVisible && mediaData.state === 'loaded') {
          mediaData.state = 'unloaded';
          (pixiNode as any).mediaSprite.texture = PIXI.Texture.EMPTY;
          (pixiNode as any).mediaPlaceholder.visible = true;
          if (mediaData.src) {
             PIXI.Assets.unload(mediaData.src);
             mediaData.texture = null;
          }
        }
      }
    }
  }

  private syncVideoState(node: SceneNode, texture: PIXI.Texture) {
      if (texture && texture.baseTexture && texture.baseTexture.resource instanceof PIXI.VideoResource) {
          const video = (texture.baseTexture.resource as PIXI.VideoResource).source;
          if (node.playing) {
              video.play().catch(() => {});
          } else {
              video.pause();
          }
          if (node.volume !== undefined) video.volume = node.volume;
          if (node.playbackRate !== undefined) video.playbackRate = node.playbackRate;
          if (node.loop !== undefined) video.loop = node.loop;
      }
  }

  private updateMediaPlayback() {
      for (const [id, node] of Object.entries(this.store.getState().nodes)) {
          if (node.type === 'media') {
              const pixiNode = this.pixiNodes.get(id);
              if (!pixiNode) continue;
              const mediaData = (pixiNode as any).mediaData;
              if (mediaData && mediaData.state === 'loaded' && mediaData.texture) {
                  const texture = mediaData.texture;
                  if (texture.baseTexture && texture.baseTexture.resource instanceof PIXI.VideoResource) {
                      const video = (texture.baseTexture.resource as PIXI.VideoResource).source;
                      
                      if (node.playing && video.paused) {
                          video.play().catch(() => {});
                      } else if (!node.playing && !video.paused) {
                          video.pause();
                      }

                      if (node.volume !== undefined) video.volume = node.volume;
                      if (node.playbackRate !== undefined) video.playbackRate = node.playbackRate;
                      if (node.loop !== undefined) video.loop = node.loop;
                      
                      if (node.currentTime !== undefined && Math.abs(video.currentTime - node.currentTime) > 0.5) {
                          video.currentTime = node.currentTime;
                      }
                  }
              }
          }
      }
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
    let tokens = this.pathCache.get(pathData);
    if (!tokens) {
      tokens = tokenizePath(pathData);
      this.pathCache.set(pathData, tokens);
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
    const usedPaths = new Set<string>();

    for (const [id, node] of Object.entries(nodes)) {
      let pixiNode = this.pixiNodes.get(id);

      if (!pixiNode) {
        if (node.type === 'rect' || node.type === 'circle' || node.type === 'path' || node.type === 'ellipse' || node.type === 'line' || node.type === 'polyline') {
          pixiNode = new PIXI.Graphics();
        } else if (node.type === 'image') {
          pixiNode = new PIXI.Container();
          const sprite = new PIXI.Sprite();
          sprite.anchor.set(0.5);
          pixiNode.addChild(sprite);
        } else {
          pixiNode = new PIXI.Container();
          if (node.type === 'media') {
            const sprite = new PIXI.Sprite();
            const placeholder = new PIXI.Graphics();
            sprite.anchor.set(0.5);
            pixiNode.addChild(placeholder);
            pixiNode.addChild(sprite);
            (pixiNode as any).mediaSprite = sprite;
            (pixiNode as any).mediaPlaceholder = placeholder;
          }
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
      } else {
        const expectedParent = node.parentId && this.pixiNodes.has(node.parentId) 
          ? this.pixiNodes.get(node.parentId)! 
          : this.viewport.container;
        if (pixiNode.parent !== expectedParent) {
          expectedParent.addChild(pixiNode);
        }
      }

      // Update visibility and opacity
      pixiNode.visible = node.visible !== false;
      pixiNode.alpha = node.opacity !== undefined ? node.opacity : 1;

      if (pixiNode instanceof PIXI.Graphics) {
        pixiNode.clear();

        if (node.fill) {
            const fill = typeof PIXI.utils?.string2hex === 'function' 
              ? PIXI.utils.string2hex(node.fill) 
              : parseInt(node.fill.replace('#', '0x')) || 0;
            if (!isNaN(fill)) {
              pixiNode.beginFill(fill);
            }
        }
        if (node.stroke) {
            const stroke = typeof PIXI.utils?.string2hex === 'function'
              ? PIXI.utils.string2hex(node.stroke)
              : parseInt(node.stroke.replace('#', '0x')) || 0;
            const strokeWidth = node.strokeWidth !== undefined ? node.strokeWidth : 2;
            if (!isNaN(stroke)) {
              pixiNode.lineStyle(strokeWidth, stroke);
            }
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
          usedPaths.add(node.pathData);
          this.drawPath(pixiNode, node.pathData);
        }

        if (node.fill) {
            pixiNode.endFill();
        }
      } else if (node.type === 'image') {
        const sprite = (pixiNode as PIXI.Container).children[0] as PIXI.Sprite;
        
        if (node.src) {
           const currentSrc = (sprite as any)._currentSrc;
           if (currentSrc !== node.src) {
               (sprite as any)._currentSrc = node.src;
               const tex = PIXI.Texture.from(node.src);
               sprite.texture = tex;
               
               if (!tex.valid) {
                   (tex.baseTexture as any).once('loaded', () => {
                       const n = this.store.getState().nodes[id];
                       if (n && n.width !== undefined && n.height !== undefined && sprite.texture === tex) {
                           sprite.width = n.width;
                           sprite.height = n.height;
                       }
                   });
               }
           }
        } else {
           sprite.texture = PIXI.Texture.EMPTY;
           (sprite as any)._currentSrc = undefined;
        }

        if (node.width !== undefined && node.height !== undefined && sprite.texture.valid) {
           sprite.width = node.width;
           sprite.height = node.height;
        } else if (node.width === undefined || node.height === undefined) {
           sprite.scale.set(1);
        }
      } else if (node.type === 'media') {
        const placeholder = (pixiNode as any).mediaPlaceholder as PIXI.Graphics;
        placeholder.clear();
        const w = node.width || 100;
        const h = node.height || 100;
        
        placeholder.beginFill(0x333333);
        placeholder.drawRect(-w/2, -h/2, w, h);
        placeholder.endFill();
        
        placeholder.lineStyle(2, 0x888888);
        placeholder.moveTo(-w/2, -h/2);
        placeholder.lineTo(w/2, h/2);
        placeholder.moveTo(w/2, -h/2);
        placeholder.lineTo(-w/2, h/2);

        const sprite = (pixiNode as any).mediaSprite as PIXI.Sprite;
        sprite.width = w;
        sprite.height = h;
      }

      this.applyMatrix(pixiNode, node.localMatrix);
    }

    for (const path of this.pathCache.keys()) {
      if (!usedPaths.has(path)) {
        this.pathCache.delete(path);
      }
    }
  }
}
