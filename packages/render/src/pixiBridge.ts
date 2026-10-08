import type {
  IRendererBridge,
  RendererBackend,
  RendererConfig,
  RendererEventListener,
  SceneNode,
  TransformHandle,
  ViewportTransform,
} from "./types.js";

export class PixiBridge implements IRendererBridge {
  readonly backendType: RendererBackend = "pixi";

  private container: HTMLElement | HTMLCanvasElement | null = null;
  private config: RendererConfig;
  private nodes: SceneNode[] = [];
  private viewport: ViewportTransform = { pan: { x: 0, y: 0 }, zoom: 1.0 };
  private handles: TransformHandle[] = [];
  private listeners: Map<string, Set<RendererEventListener>> = new Map();
  private initialized = false;

  constructor(config?: RendererConfig) {
    this.config = {
      width: 1080,
      height: 1080,
      fps: 30,
      background: "#0B1020",
      interactive: true,
      ...config,
      backend: "pixi",
    };
  }

  async init(
    container: HTMLElement | HTMLCanvasElement,
    config?: RendererConfig,
  ): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config, backend: "pixi" };
    }
    this.container = container;
    this.initialized = true;
    this.render();
    this.emit("init", { backend: this.backendType, container });
  }

  destroy(): void {
    this.initialized = false;
    this.container = null;
    this.nodes = [];
    this.handles = [];
    this.listeners.clear();
    this.emit("destroy");
  }

  render(_timeOrFrame?: number): void {
    if (!this.initialized) return;

    // Legacy PixiJS drawing loop simulation
    this.emit("render", {
      backend: this.backendType,
      viewport: this.viewport,
      nodesCount: this.nodes.length,
      handlesCount: this.handles.length,
    });
  }

  syncSceneNodes(nodes: SceneNode[]): void {
    this.nodes = [...nodes];
    if (this.initialized) {
      this.render();
      this.emit("sync", this.nodes);
    }
  }

  getSceneNodes(): SceneNode[] {
    return [...this.nodes];
  }

  updateViewport(viewport: Partial<ViewportTransform>): void {
    if (viewport.pan !== undefined) {
      this.viewport.pan = { ...viewport.pan };
    }
    if (viewport.zoom !== undefined) {
      this.viewport.zoom = viewport.zoom;
    }
    if (this.initialized) {
      this.render();
      this.emit("viewportChange", this.viewport);
    }
  }

  getViewport(): ViewportTransform {
    return {
      pan: { ...this.viewport.pan },
      zoom: this.viewport.zoom,
    };
  }

  setTransformHandles(handles: TransformHandle[]): void {
    this.handles = [...handles];
    if (this.initialized) {
      this.render();
      this.emit("handlesChange", this.handles);
    }
  }

  getTransformHandles(): TransformHandle[] {
    return [...this.handles];
  }

  on(event: string, listener: RendererEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  off(event: string, listener: RendererEventListener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(...args);
      }
    }
  }
}
