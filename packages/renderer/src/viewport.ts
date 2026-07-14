import * as PIXI from 'pixi.js';

export class Viewport {
  public container: PIXI.Container;
  public app: PIXI.Application;

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

  private drawGrid() {
    this.grid.clear();
    const width = this.app.screen.width;
    const height = this.app.screen.height;

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
    // In worker, we receive these events through PIXI's event system
    // We bind to the stage instead of DOM elements.
    this.app.stage.interactive = true;
    this.app.stage.hitArea = new PIXI.Rectangle(-1000000, -1000000, 2000000, 2000000);
    this.app.stage.on('pointerdown', this.onPointerDown.bind(this));
    this.app.stage.on('pointermove', this.onPointerMove.bind(this));
    this.app.stage.on('pointerup', this.onPointerUp.bind(this));
    this.app.stage.on('pointerupoutside', this.onPointerUp.bind(this));
    this.app.stage.on('wheel', this.onWheel.bind(this));
  }

  private onPointerDown(e: PIXI.FederatedPointerEvent) {
    // Left click with shift, or middle click (button 1)
    if (e.button === 1 || e.shiftKey) { 
      this.isDragging = true;
      this.lastPos = { x: e.global.x, y: e.global.y };
    }
  }

  private onPointerMove(e: PIXI.FederatedPointerEvent) {
    if (!this.isDragging) return;

    const dx = e.global.x - this.lastPos.x;
    const dy = e.global.y - this.lastPos.y;

    this.container.x += dx;
    this.container.y += dy;

    this.lastPos = { x: e.global.x, y: e.global.y };
    this.drawGrid();
  }

  private onPointerUp() {
    this.isDragging = false;
  }

  private onWheel(e: PIXI.FederatedWheelEvent) {
    const zoomFactor = 1 - e.deltaY * 0.001;
    const localPos = this.container.toLocal(new PIXI.Point(e.global.x, e.global.y));

    this.container.scale.x *= zoomFactor;
    this.container.scale.y *= zoomFactor;

    const newLocalPos = this.container.toLocal(new PIXI.Point(e.global.x, e.global.y));

    this.container.x += (newLocalPos.x - localPos.x) * this.container.scale.x;
    this.container.y += (newLocalPos.y - localPos.y) * this.container.scale.y;
    this.drawGrid();
  }
}
