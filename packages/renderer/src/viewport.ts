import * as PIXI from 'pixi.js';

export class Viewport {
  public container: PIXI.Container;
  private app: PIXI.Application;
  
  private width: number;
  private height: number;

  private isDragging = false;
  private lastPos = { x: 0, y: 0 };

  private grid: PIXI.Graphics;

  constructor(app: PIXI.Application, width: number, height: number) {
    this.app = app;
    this.width = width;
    this.height = height;

    // Grid setup
    this.grid = new PIXI.Graphics();
    this.app.stage.addChild(this.grid);

    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    this.drawGrid();
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.drawGrid();
  }

  public drawGrid() {
    this.grid.clear();
    const width = this.width;
    const height = this.height;

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

  public handleEvent(e: any) {
    if (e.type === 'pointerdown') {
      if (e.button === 1 || e.shiftKey) { // Middle click or shift+click for pan
        this.isDragging = true;
        this.lastPos = { x: e.clientX, y: e.clientY };
      }
    } else if (e.type === 'pointermove') {
      if (!this.isDragging) return;

      const dx = e.clientX - this.lastPos.x;
      const dy = e.clientY - this.lastPos.y;

      this.container.x += dx;
      this.container.y += dy;

      this.lastPos = { x: e.clientX, y: e.clientY };
      this.drawGrid();
    } else if (e.type === 'pointerup') {
      this.isDragging = false;
    } else if (e.type === 'wheel') {
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
}
