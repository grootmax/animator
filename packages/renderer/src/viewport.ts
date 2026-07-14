import * as PIXI from 'pixi.js';

export class Viewport {
  public container: PIXI.Container;
  private app: PIXI.Application;
  private eventBus: EventTarget;

  private isDragging = false;
  private lastPos = { x: 0, y: 0 };

  private grid: PIXI.Graphics;

  constructor(app: PIXI.Application, eventBus: EventTarget) {
    this.app = app;
    this.eventBus = eventBus;

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
    this.eventBus.addEventListener('pointerdown', (e: Event) => this.onPointerDown(e as any));
    this.eventBus.addEventListener('pointermove', (e: Event) => this.onPointerMove(e as any));
    this.eventBus.addEventListener('pointerup', (e: Event) => this.onPointerUp());
    this.eventBus.addEventListener('wheel', (e: Event) => this.onWheel(e as any));
  }

  private onPointerDown(e: any) {
    if (e.button === 1 || e.shiftKey) { // Middle click or shift+click for pan
      this.isDragging = true;
      this.lastPos = { x: e.clientX, y: e.clientY };
    }
  }

  private onPointerMove(e: any) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastPos.x;
    const dy = e.clientY - this.lastPos.y;

    this.container.x += dx;
    this.container.y += dy;

    this.lastPos = { x: e.clientX, y: e.clientY };
    this.drawGrid();
  }

  private onPointerUp() {
    this.isDragging = false;
  }

  private onWheel(e: any) {
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
