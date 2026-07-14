import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore, transientState } from '@monorepo/scene-graph';
import { Viewport } from './viewport';

export class TransformHandles {
  public container: PIXI.Container;
  private store: ReturnType<typeof createSceneGraphStore>;
  private viewport: Viewport;
  private selectedNodeId: string | null = null;

  private box: PIXI.Graphics;
  private handles: Record<string, PIXI.Graphics> = {};

  private isDragging = false;
  private dragType: string | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private startNodeState: any = null;

  constructor(store: ReturnType<typeof createSceneGraphStore>, viewport: Viewport) {
    this.store = store;
    this.viewport = viewport;
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

    // Add global pointer move/up
    window.addEventListener('pointermove', this.onDragMove.bind(this));
    window.addEventListener('pointerup', this.onDragEnd.bind(this));
  }

  public setSelectedNode(id: string | null) {
    this.selectedNodeId = id;
    this.update();
  }

  public update() {
    if (!this.selectedNodeId) {
      this.container.visible = false;
      return;
    }

    const state = this.store.getState();
    const node = state.nodes[this.selectedNodeId];
    const tNode = transientState[this.selectedNodeId];

    if (!node || node.locked || !node.visible || !tNode) {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;

    // Use worldMatrix to position the handles relative to the viewport
    const wm = tNode.worldMatrix;

    // Apply world matrix to the handles container
    this.container.setTransform(
      wm[6], wm[7],
      Math.hypot(wm[0], wm[1]), Math.hypot(wm[3], wm[4]),
      Math.atan2(wm[1], wm[0])
    );

    let w = node.width || (node.radius ? node.radius * 2 : 100);
    let h = node.height || (node.radius ? node.radius * 2 : 100);

    this.box.clear();
    this.box.lineStyle(2, 0x00aaff, 1);
    this.box.drawRect(-w/2, -h/2, w, h);

    // The handle visual size needs to counter-scale BOTH the local node's world scale AND the viewport zoom
    // We apply viewport scaling in bridge.ts by making handles a child of viewport.
    const globalScaleX = Math.hypot(wm[0], wm[1]);
    const globalScaleY = Math.hypot(wm[3], wm[4]);

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
    this.startNodeState = { ...transientState[this.selectedNodeId] } as any;
  }

  private onDragMove(e: PointerEvent) {
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

    this.store.getState().updateTransientNode(this.selectedNodeId, updates);
    this.store.getState().recalculateMatrices();
  }

  private onDragEnd() {
    this.isDragging = false;
    this.dragType = null;
    this.startNodeState = null;
  }
}
