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
  private lastRenderedNodes: Map<string, SceneNode> = new Map();
  private dirtyNodes: Set<string> = new Set();

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

    this.app.ticker.add(() => {
        this.syncFrameGated();
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

  private syncFrameGated() {
    const nodes = this.store.getState().nodes;

    for (const id in nodes) {
      if (nodes[id] !== this.lastRenderedNodes.get(id)) {
        this.dirtyNodes.add(id);
      }
    }

    for (const id of this.lastRenderedNodes.keys()) {
      if (!nodes[id]) {
        this.dirtyNodes.add(id);
      }
    }

    if (this.dirtyNodes.size === 0) return;

    for (const id of this.dirtyNodes) {
      this.syncNode(id, nodes[id]);
    }

    this.dirtyNodes.clear();
  }

  private hasVisualChanges(node: SceneNode, lastNode?: SceneNode) {
    if (!lastNode) return true;
    return node.fill !== lastNode.fill ||
           node.stroke !== lastNode.stroke ||
           node.strokeWidth !== lastNode.strokeWidth ||
           node.width !== lastNode.width ||
           node.height !== lastNode.height ||
           node.radius !== lastNode.radius ||
           node.rx !== lastNode.rx ||
           node.ry !== lastNode.ry ||
           node.x1 !== lastNode.x1 ||
           node.y1 !== lastNode.y1 ||
           node.x2 !== lastNode.x2 ||
           node.y2 !== lastNode.y2 ||
           node.points !== lastNode.points ||
           node.pathData !== lastNode.pathData ||
           node.type !== lastNode.type;
  }

  private syncNode(id: string, node: SceneNode | undefined) {
    if (!node) {
      const pixiNode = this.pixiNodes.get(id);
      if (pixiNode) {
        pixiNode.parent?.removeChild(pixiNode);
        pixiNode.destroy();
        this.pixiNodes.delete(id);
      }
      this.lastRenderedNodes.delete(id);
      return;
    }

    const lastNode = this.lastRenderedNodes.get(id);
    let pixiNode = this.pixiNodes.get(id);
    let created = false;

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
      created = true;

      if (node.parentId && this.pixiNodes.has(node.parentId)) {
        this.pixiNodes.get(node.parentId)!.addChild(pixiNode);
      } else {
        this.viewport.container.addChild(pixiNode);
      }
    } else if (lastNode && node.parentId !== lastNode.parentId) {
      pixiNode.parent?.removeChild(pixiNode);
      if (node.parentId && this.pixiNodes.has(node.parentId)) {
        this.pixiNodes.get(node.parentId)!.addChild(pixiNode);
      } else {
        this.viewport.container.addChild(pixiNode);
      }
    }

    const visualChanged = created || this.hasVisualChanges(node, lastNode);
    const transformChanged = created || node.localMatrix !== lastNode?.localMatrix;
    const opacityVisibleChanged = created || node.visible !== lastNode?.visible || node.opacity !== lastNode?.opacity;

    if (opacityVisibleChanged) {
      pixiNode.visible = node.visible !== false;
      pixiNode.alpha = node.opacity !== undefined ? node.opacity : 1;
    }

    if (visualChanged && pixiNode instanceof PIXI.Graphics) {
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

    if (transformChanged) {
      this.applyMatrix(pixiNode, node.localMatrix);
    }

    this.lastRenderedNodes.set(id, node);
  }
}
