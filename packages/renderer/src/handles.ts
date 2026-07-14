import * as PIXI from 'pixi.js';
import { SceneNode } from '@monorepo/scene-graph';
import { Viewport } from './viewport';

export class TransformHandles {
  public container: PIXI.Container;
  private viewport: Viewport;
  private dispatch: (msg: any) => void;
  private selectedNodeId: string | null = null;
  private getPixiNode?: (id: string) => PIXI.Container | PIXI.Graphics | undefined;

  private box: PIXI.Graphics;
  private handles: Record<string, PIXI.Graphics> = {};

  private isDragging = false;
  private hasMoved = false;
  private dragType: string | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private startNodeState: any | null = null;

  constructor(
    viewport: Viewport,
    dispatch: (msg: any) => void,
    getPixiNode?: (id: string) => PIXI.Container | PIXI.Graphics | undefined
  ) {
    this.viewport = viewport;
    this.dispatch = dispatch;
    this.getPixiNode = getPixiNode;

    this.container = new PIXI.Container();
    this.container.zIndex = 1000;

    this.box = new PIXI.Graphics();
    this.box.interactive = true;
    this.box.cursor = 'move';
    this.box.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this.onDragStart(e, 'move'));
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
    if (bufferIndex === undefined) return;
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
    let minX = -w / 2;
    let minY = -h / 2;
    let maxX = w / 2;
    let maxY = h / 2;

    if ((node.type === 'group' || node.type === 'container') && this.getPixiNode) {
      const pixiNode = this.getPixiNode(this.selectedNodeId);
      if (pixiNode && pixiNode.children.length > 0) {
        const bounds = pixiNode.getLocalBounds();
        if (bounds.width > 0 || bounds.height > 0) {
          minX = bounds.x;
          minY = bounds.y;
          maxX = bounds.x + bounds.width;
          maxY = bounds.y + bounds.height;
          w = bounds.width;
          h = bounds.height;
        }
      }
    }

    this.box.clear();
    this.box.beginFill(0xffffff, 0.01); // Almost transparent fill to catch pointer events
    this.box.lineStyle(2, 0x00aaff, 1);
    this.box.drawRect(minX, minY, w, h);

    const globalScaleX = Math.hypot(wm0, wm1);
    const globalScaleY = Math.hypot(wm3, wm4);

    const sizeX = 10 / (globalScaleX || 1);
    const sizeY = 10 / (globalScaleY || 1);

    const drawHandle = (g: PIXI.Graphics, x: number, y: number) => {
      g.clear();
      g.beginFill(0xffffff);
      g.lineStyle(1 / Math.min(globalScaleX || 1, globalScaleY || 1), 0x00aaff);
      g.drawRect(x - sizeX/2, y - sizeY/2, sizeX, sizeY);
      g.endFill();
    };

    drawHandle(this.handles['tl'], minX, minY);
    drawHandle(this.handles['tr'], maxX, minY);
    drawHandle(this.handles['bl'], minX, maxY);
    drawHandle(this.handles['br'], maxX, maxY);

    drawHandle(this.handles['rot'], minX + w/2, minY - 20 / (globalScaleY || 1));
  }

  private onDragStart(e: PIXI.FederatedPointerEvent, type: string) {
    e.stopPropagation();
    if (!this.selectedNodeId) return;

    this.isDragging = true;
    this.hasMoved = false;
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
       const cx = this.container.x * this.viewport.container.scale.x + this.container.x;
       const cy = this.container.y * this.viewport.container.scale.y + this.container.y;

       const startAngle = Math.atan2(this.dragStartPos.y - cy, this.dragStartPos.x - cx);
       const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
       updates.rotation = this.startNodeState.rotation + (currentAngle - startAngle);
    } else if (this.dragType === 'move') {
       updates.x = this.startNodeState.x + dx / this.viewport.container.scale.x;
       updates.y = this.startNodeState.y + dy / this.viewport.container.scale.y;
    } else {
       const scaleDelta = dx / 100;
       updates.scaleX = this.startNodeState.scaleX + scaleDelta;
       updates.scaleY = this.startNodeState.scaleY + scaleDelta;
    }

    this.dispatch({ type: 'UPDATE_NODE', id: this.selectedNodeId, updates });
  }

  private onDragEnd() {
    this.isDragging = false;
    this.hasMoved = false;
    this.dragType = null;
    this.startNodeState = null;
  }
}
