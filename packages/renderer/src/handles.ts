import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore, getBounds } from '@monorepo/scene-graph';
import { Viewport } from './viewport';

export class TransformHandles {
  public container: PIXI.Container;
  private store: ReturnType<typeof createSceneGraphStore>;
  private viewport: Viewport;

  private box: PIXI.Graphics;
  private handles: Record<string, PIXI.Graphics> = {};

  private isDragging = false;
  private hasMoved = false;
  private dragType: string | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private startNodeState: SceneNode | null = null;
  private getPixiNode: (id: string) => PIXI.Container | PIXI.Graphics | undefined;

  constructor(
      store: ReturnType<typeof createSceneGraphStore>, 
      viewport: Viewport,
      getPixiNode: (id: string) => PIXI.Container | PIXI.Graphics | undefined
  ) {
    this.store = store;
    this.viewport = viewport;
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

    // Add global pointer move/up
    window.addEventListener('pointermove', this.onDragMove.bind(this));
    window.addEventListener('pointerup', this.onDragEnd.bind(this));
  }

  public setSelectedNode(id: string | null) {
    this.store.getState().setSelectedNodeId(id);
  }

  public update() {
    const selectedNodeId = this.store.getState().selectedNodeId;
    if (!selectedNodeId) {
      this.container.visible = false;
      return;
    }

    const state = this.store.getState();
    const node = state.nodes[selectedNodeId];

    if (!node || node.locked || !node.visible) {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;

    const bounds = getBounds(selectedNodeId, this.store);
    if (!bounds) {
      this.container.visible = false;
      return;
    }

    // Reset container transform to world space
    this.container.setTransform(0, 0, 1, 1, 0, 0, 0, 0, 0);

    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const cx = (bounds.maxX + bounds.minX) / 2;
    
    this.box.clear();
    this.box.beginFill(0xffffff, 0.01); // Almost transparent fill to catch pointer events
    this.box.lineStyle(2, 0x00aaff, 1);
    this.box.drawRect(bounds.minX, bounds.minY, w, h);

    // handles are drawn in world space, we no longer need to counter scale the node's local scale
    // as the container is unscaled. We could scale by 1 / viewport.container.scale.x to keep handles 
    // pixel perfect, but 10px in world space is fine for this demo.
    const vScaleX = this.viewport.container.scale.x || 1;
    const vScaleY = this.viewport.container.scale.y || 1;
    
    const sizeX = 10 / vScaleX;
    const sizeY = 10 / vScaleY;

    const drawHandle = (g: PIXI.Graphics, x: number, y: number) => {
      g.clear();
      g.beginFill(0xffffff);
      g.lineStyle(1 / Math.min(vScaleX, vScaleY), 0x00aaff);
      g.drawRect(x - sizeX/2, y - sizeY/2, sizeX, sizeY);
      g.endFill();
    };

    drawHandle(this.handles['tl'], bounds.minX, bounds.minY);
    drawHandle(this.handles['tr'], bounds.maxX, bounds.minY);
    drawHandle(this.handles['bl'], bounds.minX, bounds.maxY);
    drawHandle(this.handles['br'], bounds.maxX, bounds.maxY);

    drawHandle(this.handles['rot'], cx, bounds.minY - 20 / vScaleY);
  }

  private onDragStart(e: PIXI.FederatedPointerEvent, type: string) {
    e.stopPropagation();
    const selectedNodeId = this.store.getState().selectedNodeId;
    if (!selectedNodeId) return;

    this.isDragging = true;
    this.hasMoved = false;
    this.dragType = type;
    this.dragStartPos = { x: e.globalX, y: e.globalY };
    this.startNodeState = { ...this.store.getState().nodes[selectedNodeId] } as SceneNode;
  }

  private onDragMove(e: PointerEvent) {
    const selectedNodeId = this.store.getState().selectedNodeId;
    if (!this.isDragging || !selectedNodeId || !this.startNodeState) return;

    if (!this.hasMoved) {
      (this.store.getState() as any).commitHistory?.();
      this.hasMoved = true;
    }

    const dx = e.clientX - this.dragStartPos.x;
    const dy = e.clientY - this.dragStartPos.y;

    const updates: any = {};

    if (this.dragType === 'rot') {
       const node = this.store.getState().nodes[selectedNodeId];
       const wx = node.worldMatrix[6];
       const wy = node.worldMatrix[7];

       const cx = wx * this.viewport.container.scale.x + this.viewport.container.x;
       const cy = wy * this.viewport.container.scale.y + this.viewport.container.y;

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

    this.store.getState().updateNode(selectedNodeId, updates);
    this.store.getState().recalculateMatrices();
  }

  private onDragEnd() {
    this.isDragging = false;
    this.hasMoved = false;
    this.dragType = null;
    this.startNodeState = null;
  }
}
