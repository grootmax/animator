import * as PIXI from 'pixi.js';

export class Viewport {
  public container: PIXI.Container;
  private app: PIXI.Application;

  private isDragging = false;
  private lastPos = { x: 0, y: 0 };

  private grid: PIXI.Graphics;

  constructor(app: PIXI.Application) {
    this.app = app;

    // Grid setup
    this.grid = new PIXI.Graphics();
    this.app.stage.addChild(this.grid);

    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    this.setupEvents();
    this.drawGrid();
  }

  public drawGrid() {
    this.grid.clear();
    const width = this.app.renderer.width / this.app.renderer.resolution;
    const height = this.app.renderer.height / this.app.renderer.resolution;

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
    const canvas = this.app.view as any;
    // In worker, canvas might be OffscreenCanvas and not have addEventListener 
    // or we might manually feed events. Let's still bind if available.
    if (canvas && canvas.addEventListener) {
        canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
    } else {
        // Fallback for worker: attach pointerup to canvas if possible
        if (canvas && canvas.addEventListener) {
            canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
        }
    }
  }

  public onPointerDown(e: any) {
    if (e.button === 1 || e.shiftKey) { // Middle click or shift+click for pan
      this.isDragging = true;
      this.lastPos = { x: e.clientX, y: e.clientY };
    }
  }

  public onPointerMove(e: any) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastPos.x;
    const dy = e.clientY - this.lastPos.y;

    this.container.x += dx;
    this.container.y += dy;

    this.lastPos = { x: e.clientX, y: e.clientY };
    this.drawGrid();
  }

  public onPointerUp() {
    this.isDragging = false;
  }

  public onWheel(e: any) {
    if (e.preventDefault) e.preventDefault();

    const zoomFactor = 1 - e.deltaY * 0.001;
    const localPos = this.container.toLocal(new PIXI.Point(e.clientX, e.clientY));

    this.container.scale.x *= zoomFactor;
    this.container.scale.y *= zoomFactor;

    const newLocalPos = this.container.toLocal(new PIXI.Point(e.clientX, e.clientY));

    this.container.x += (newLocalPos.x - localPos.x) * this.container.scale.x;
    this.container.y += (newLocalPos.y - localPos.y) * this.container.scale.y;
    this.drawGrid();
  }
}
