import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';
import { Viewport } from './viewport';

export class TransformHandles {
  public container: PIXI.Container;
  private viewport: Viewport;
  private dispatch: (msg: any) => void;
  private selectedNodeId: string | null = null;

  private box: PIXI.Graphics;
  private handles: Record<string, PIXI.Graphics> = {};

  private isDragging = false;
  private dragType: string | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private startNodeState: any | null = null;

  constructor(viewport: Viewport, dispatch: (msg: any) => void) {
    this.viewport = viewport;
    this.dispatch = dispatch;
    this.container = new PIXI.Container();
    this.container.zIndex = 1000;

    this.box = new PIXI.Graphics();
    this.container.addChild(this.box);

    const corners = ['tl', 'tr', 'bl', 'br', 'rot'];
    for (const id of corners) {
      const handle = new PIXI.Graphics();
      handle.interactive = true;
      handle.cursor = id === 'rot' ? 'crosshair' : 'pointer';

      handle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this.onDragStart(e, id));

      this.handles[id] = handle;
      this.container.addChild(handle);
    }
  }

  public handleEvent(e: any) {
    if (e.type === 'pointermove') {
      this.onDragMove(e);
    } else if (e.type === 'pointerup') {
      this.onDragEnd();
    }
  }

  public setSelectedNode(id: string | null) {
    this.selectedNodeId = id;
  }

  public update(nodeConfigs: Map<string, any>, sharedMatrices: Float32Array) {
    if (!this.selectedNodeId) {
      this.container.visible = false;
      return;
    }

    const node = nodeConfigs.get(this.selectedNodeId);

    if (!node || node.locked || !node.visible) {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;

    // Read world matrix from shared memory
    const bufferIndex = node.bufferIndex;
    const offset = bufferIndex * 18 + 9; // world matrix starts at 9
    
    const wm0 = sharedMatrices[offset];
    const wm1 = sharedMatrices[offset + 1];
    const wm3 = sharedMatrices[offset + 3];
    const wm4 = sharedMatrices[offset + 4];
    const wm6 = sharedMatrices[offset + 6];
    const wm7 = sharedMatrices[offset + 7];

    // Apply world matrix to the handles container
    this.container.setTransform(
      wm6, wm7,
      Math.hypot(wm0, wm1), Math.hypot(wm3, wm4),
      Math.atan2(wm1, wm0)
    );

    let w = node.width || (node.radius ? node.radius * 2 : 100);
    let h = node.height || (node.radius ? node.radius * 2 : 100);

    this.box.clear();
    this.box.lineStyle(2, 0x00aaff, 1);
    this.box.drawRect(-w/2, -h/2, w, h);

    // The handle visual size needs to counter-scale BOTH the local node's world scale AND the viewport zoom
    // We apply viewport scaling in bridge.ts by making handles a child of viewport.
    const globalScaleX = Math.hypot(wm0, wm1);
    const globalScaleY = Math.hypot(wm3, wm4);

    const sizeX = 10 / globalScaleX;
    const sizeY = 10 / globalScaleY;

    const drawHandle = (g: PIXI.Graphics, x: number, y: number) => {
      g.clear();
      g.beginFill(0xffffff);
      g.lineStyle(1 / Math.min(globalScaleX, globalScaleY), 0x00aaff); // line width invariant
      g.drawRect(x - sizeX/2, y - sizeY/2, sizeX, sizeY);
      g.endFill();
    };

    drawHandle(this.handles['tl'], -w/2, -h/2);
    drawHandle(this.handles['tr'], w/2, -h/2);
    drawHandle(this.handles['bl'], -w/2, h/2);
    drawHandle(this.handles['br'], w/2, h/2);

    drawHandle(this.handles['rot'], 0, -h/2 - 20/globalScaleY);
  }

  private onDragStart(e: PIXI.FederatedPointerEvent, type: string) {
    e.stopPropagation();
    if (!this.selectedNodeId) return;

    this.isDragging = true;
    this.dragType = type;
    this.dragStartPos = { x: e.globalX, y: e.globalY };
    
    // Send a message to get the exact node state when dragging starts
    this.dispatch({ type: 'REQUEST_NODE_STATE', id: this.selectedNodeId });
  }

  public setStartNodeState(state: any) {
    this.startNodeState = state;
  }

  private onDragMove(e: any) {
    if (!this.isDragging || !this.selectedNodeId || !this.startNodeState) return;

    const dx = e.clientX - this.dragStartPos.x;
    const dy = e.clientY - this.dragStartPos.y;

    const updates: any = {};

    if (this.dragType === 'rot') {
       // get container absolute pos on screen to calculate angle
       const rect = (this.viewport.container as any).parent.parent?.getBounds?.() || {x:0, y:0};
       const cx = this.container.x * this.viewport.container.scale.x + this.viewport.container.x;
       const cy = this.container.y * this.viewport.container.scale.y + this.viewport.container.y;

       const startAngle = Math.atan2(this.dragStartPos.y - cy, this.dragStartPos.x - cx);
       const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
       updates.rotation = this.startNodeState.rotation + (currentAngle - startAngle);
    } else {
       const scaleDelta = dx / 100;
       updates.scaleX = this.startNodeState.scaleX + scaleDelta;
       updates.scaleY = this.startNodeState.scaleY + scaleDelta;
    }

    this.dispatch({ type: 'UPDATE_NODE', id: this.selectedNodeId, updates });
  }

  private onDragEnd() {
    this.isDragging = false;
    this.dragType = null;
    this.startNodeState = null;
  }
}
