import * as PIXI from 'pixi.js';

export class Viewport {
  public container: PIXI.Container;
  private app: PIXI.Application;

  private isDragging = false;
  private lastPos = { x: 0, y: 0 };

  constructor(app: PIXI.Application) {
    this.app = app;
    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    this.setupEvents();
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
  }

  private onPointerUp() {
    this.isDragging = false;
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
  }
}
