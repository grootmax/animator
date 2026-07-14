import * as PIXI from 'pixi.js';
import { SceneNode } from '@monorepo/scene-graph';
import { Viewport } from './viewport';
import { TransformHandles, IWorkerStore } from './handles';
import { Matrix3 } from '@monorepo/math';
import { tokenizePath } from '@monorepo/serialization';

let app: PIXI.Application;
let viewport: Viewport;
let handles: TransformHandles;
let pixiNodes: Map<string, PIXI.Container | PIXI.Graphics> = new Map();

const workerStore: IWorkerStore = {
  nodes: {},
  updateNode: (id: string, updates: Partial<SceneNode>) => {
    postMessage({
      type: 'UPDATE_NODE',
      payload: { id, updates }
    });
  }
};

function applyMatrix(displayObject: PIXI.Container, matrix: Matrix3) {
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
    skewX, 0,
    0, 0
  );
}

function drawPath(graphics: PIXI.Graphics, pathData: string) {
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

self.onmessage = (msg) => {
  const { type, payload } = msg.data;

  if (type === 'INIT') {
    const { canvas, width, height, devicePixelRatio } = payload;
    
    app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x1a1a1a,
      resolution: devicePixelRatio || 1,
      autoDensity: true,
    });

    app.stage.sortableChildren = true;

    viewport = new Viewport(app);
    viewport.width = width;
    viewport.height = height;
    viewport.drawGrid();

    handles = new TransformHandles(workerStore, viewport);
    viewport.container.addChild(handles.container);

    viewport.container.interactive = true;
    viewport.container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target === viewport.container) {
         handles.setSelectedNode(null);
         postMessage({ type: 'SELECT_NODE', payload: null });
      }
    });

    app.ticker.add(() => {
        handles.update();
    });
  } 
  else if (type === 'RESIZE') {
    const { width, height, devicePixelRatio } = payload;
    if (app) {
      app.renderer.resize(width, height);
      app.renderer.resolution = devicePixelRatio || 1;
      viewport.width = width;
      viewport.height = height;
      viewport.drawGrid();
    }
  }
  else if (type === 'EVENT') {
    if (!app) return;
    const { eventName, data } = payload;
    
    const mockEvent = {
      ...data,
      preventDefault: () => {},
      stopPropagation: () => {},
      target: app.view
    };

    // Forward to Pixi's EventSystem
    const events = app.renderer.events as any;
    if (eventName === 'pointerdown') events.onPointerDown(mockEvent);
    if (eventName === 'pointermove') events.onPointerMove(mockEvent);
    if (eventName === 'pointerup') events.onPointerUp(mockEvent);
    if (eventName === 'pointerleave') events.onPointerOut(mockEvent);
    if (eventName === 'wheel') events.onWheel(mockEvent);

    // Also forward to our custom listeners
    if (eventName === 'pointerdown') viewport.onPointerDown(data);
    if (eventName === 'pointermove') {
      viewport.onPointerMove(data);
      handles.onDragMove(data);
    }
    if (eventName === 'pointerup') {
      viewport.onPointerUp();
      handles.onDragEnd();
    }
    if (eventName === 'wheel') viewport.onWheel(data);
  }
  else if (type === 'SYNC_NODES_DELTA') {
    const { updated, deleted } = payload;

    for (const id of deleted) {
      const node = pixiNodes.get(id);
      if (node) {
        node.parent?.removeChild(node);
        node.destroy();
        pixiNodes.delete(id);
      }
      delete workerStore.nodes[id];
    }

    for (const [id, node] of Object.entries(updated)) {
      workerStore.nodes[id] = node as SceneNode;
      let pixiNode = pixiNodes.get(id);

      if (!pixiNode) {
        if (['rect', 'circle', 'path', 'ellipse', 'line', 'polyline'].includes((node as SceneNode).type)) {
          pixiNode = new PIXI.Graphics();
        } else {
          pixiNode = new PIXI.Container();
        }

        pixiNode.interactive = true;
        pixiNode.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            const n = workerStore.nodes[id];
            if (n && !n.locked && n.visible) {
              handles.setSelectedNode(id);
              postMessage({ type: 'SELECT_NODE', payload: id });
            }
        });

        pixiNodes.set(id, pixiNode);

        if ((node as SceneNode).parentId && pixiNodes.has((node as SceneNode).parentId!)) {
          pixiNodes.get((node as SceneNode).parentId!)!.addChild(pixiNode);
        } else {
          viewport.container.addChild(pixiNode);
        }
      }

      pixiNode.visible = (node as SceneNode).visible !== false;
      pixiNode.alpha = (node as SceneNode).opacity !== undefined ? (node as SceneNode).opacity! : 1;

      if (pixiNode instanceof PIXI.Graphics) {
        pixiNode.clear();
        const gNode = node as SceneNode;

        if (gNode.fill) {
            const fill = parseInt(gNode.fill.replace('#', '0x'));
            pixiNode.beginFill(fill);
        }
        if (gNode.stroke) {
            const stroke = parseInt(gNode.stroke.replace('#', '0x'));
            const strokeWidth = gNode.strokeWidth !== undefined ? gNode.strokeWidth : 2;
            pixiNode.lineStyle(strokeWidth, stroke);
        }

        if (gNode.type === 'rect' && gNode.width && gNode.height) {
          pixiNode.drawRect(-gNode.width/2, -gNode.height/2, gNode.width, gNode.height);
        } else if (gNode.type === 'circle' && gNode.radius) {
          pixiNode.drawCircle(0, 0, gNode.radius);
        } else if (gNode.type === 'ellipse' && gNode.rx && gNode.ry) {
          pixiNode.drawEllipse(0, 0, gNode.rx, gNode.ry);
        } else if (gNode.type === 'line') {
          pixiNode.moveTo(gNode.x1 || 0, gNode.y1 || 0);
          pixiNode.lineTo(gNode.x2 || 0, gNode.y2 || 0);
        } else if (gNode.type === 'polyline' && gNode.points) {
          const pts = gNode.points.trim().split(/[\s,]+/).map(parseFloat);
          if (pts.length >= 2) {
            pixiNode.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) {
                pixiNode.lineTo(pts[i], pts[i+1]);
            }
          }
        } else if (gNode.type === 'path' && gNode.pathData) {
          drawPath(pixiNode, gNode.pathData);
        }

        if (gNode.fill) {
            pixiNode.endFill();
        }
      }

      if ((node as SceneNode).localMatrix) {
        applyMatrix(pixiNode, (node as SceneNode).localMatrix!);
      }
    }
  }
  else if (type === 'ACTION') {
    if (payload.action === 'ZOOM_IN' && viewport) {
      viewport.container.scale.x *= 1.2;
      viewport.container.scale.y *= 1.2;
      viewport.drawGrid();
    } else if (payload.action === 'ZOOM_OUT' && viewport) {
      viewport.container.scale.x /= 1.2;
      viewport.container.scale.y /= 1.2;
      viewport.drawGrid();
    }
  }
};
