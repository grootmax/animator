import * as PIXI from 'pixi.js';
import { createSceneGraphStore } from '@monorepo/scene-graph';

export class Viewport {
  public container: PIXI.Container;
  private app: PIXI.Application;
  private store: ReturnType<typeof createSceneGraphStore>;

  private isDragging = false;
  private lastPos = { x: 0, y: 0 };

  private grid: PIXI.Graphics;
  
  private lastStoreSync = 0;
  private throttleMs = 16;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: PIXI.Application, store: ReturnType<typeof createSceneGraphStore>) {
    this.app = app;
    this.store = store;

    // Grid setup
    this.grid = new PIXI.Graphics();
    this.app.stage.addChild(this.grid);

    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);
    
    const initialViewport = this.store.getState().viewport;
    if (initialViewport) {
      this.container.x = initialViewport.x;
      this.container.y = initialViewport.y;
      this.container.scale.set(initialViewport.zoom);
    }

    this.setupEvents();
    this.drawGrid();
    
    this.store.subscribe((state) => {
      // In case viewport gets updated from outside (like remote sync or reset)
      // but to prevent feedback loops, we might skip applying if we are currently dragging.
      // For now, let's just make sure we are not overwriting our active state.
    });
  }

  private syncStore() {
    const now = performance.now();
    if (now - this.lastStoreSync > this.throttleMs) {
      if (this.syncTimer) {
        clearTimeout(this.syncTimer);
        this.syncTimer = null;
      }
      this.store.getState().setViewport({
        x: this.container.x,
        y: this.container.y,
        zoom: this.container.scale.x
      });
      this.lastStoreSync = now;
    } else if (!this.syncTimer) {
      this.syncTimer = setTimeout(() => {
        this.store.getState().setViewport({
          x: this.container.x,
          y: this.container.y,
          zoom: this.container.scale.x
        });
        this.lastStoreSync = performance.now();
        this.syncTimer = null;
      }, this.throttleMs);
    }
  }

  private drawGrid() {
    this.grid.clear();
    const width = window.innerWidth;
    const height = window.innerHeight;

    const gridSize = 50 * this.container.scale.x;
    const offsetX = this.container.x % gridSize;
    const offsetY = this.container.y % gridSize;

    this.grid.lineStyle(1, 0x333333, 0.5);

    for (let x = offsetX; x < width; x += gridSize) {
      this.grid.moveTo(x, 0);
      this.grid.lineTo(x, height);
    }

    for (let y = offsetY; y < height; y += gridSize) {
      this.grid.moveTo(0, y);
      this.grid.lineTo(width, y);
    }
  }

  private setupEvents() {
    const canvas = this.app.view as HTMLCanvasElement;

    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button === 1 || e.shiftKey) { // Middle click or shift+click for pan
      this.isDragging = true;
      this.lastPos = { x: e.clientX, y: e.clientY };
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastPos.x;
    const dy = e.clientY - this.lastPos.y;

    this.container.x += dx;
    this.container.y += dy;

    this.lastPos = { x: e.clientX, y: e.clientY };
    this.drawGrid();
    this.syncStore();
  }

  private onPointerUp() {
    if (this.isDragging) {
      this.isDragging = false;
      // Force sync on drag end
      this.store.getState().setViewport({
        x: this.container.x,
        y: this.container.y,
        zoom: this.container.scale.x
      });
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();

    const zoomFactor = 1 - e.deltaY * 0.001;
    const localPos = this.container.toLocal(new PIXI.Point(e.clientX, e.clientY));

    this.container.scale.x *= zoomFactor;
    this.container.scale.y *= zoomFactor;

    const newLocalPos = this.container.toLocal(new PIXI.Point(e.clientX, e.clientY));

    this.container.x += (newLocalPos.x - localPos.x) * this.container.scale.x;
    this.container.y += (newLocalPos.y - localPos.y) * this.container.scale.y;
    this.drawGrid();
    this.syncStore();
  }
}
