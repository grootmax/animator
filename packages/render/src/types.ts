export type RendererBackend = "skottie" | "pixi";

export interface Vector2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface ViewportTransform {
  pan: Vector2D;
  zoom: number;
}

export interface TransformHandle {
  id: string;
  type: "translate" | "scale" | "rotate" | "corner" | "edge";
  position: Vector2D;
  cursor?: string;
  selected?: boolean;
}

export interface SceneNode {
  id: string;
  type: "shape" | "text" | "image" | "group" | "lottie";
  position: Vector2D;
  scale?: Vector2D;
  rotation?: number; // degrees
  opacity?: number; // 0-100
  visible?: boolean;
  size?: Size2D;
  children?: SceneNode[];
  lottieData?: string | object;
  [key: string]: unknown;
}

export interface RendererConfig {
  backend?: RendererBackend;
  width?: number;
  height?: number;
  fps?: number;
  background?: string;
  interactive?: boolean;
}

export interface HandleInteractEvent {
  handleId: string;
  action: "start" | "move" | "end";
  position: Vector2D;
  delta?: Vector2D;
}

export type RendererEventListener = (...args: unknown[]) => void;

export interface IRendererBridge {
  readonly backendType: RendererBackend;

  /**
   * Initialize the renderer bridge onto a container element or canvas
   */
  init(
    container: HTMLElement | HTMLCanvasElement,
    config?: RendererConfig,
  ): Promise<void>;

  /**
   * Clean up and destroy renderer resources
   */
  destroy(): void;

  /**
   * Trigger frame rendering or render at a specified time/frame
   */
  render(timeOrFrame?: number): void;

  /**
   * Synchronize active scene graph nodes with the renderer
   */
  syncSceneNodes(nodes: SceneNode[]): void;

  /**
   * Get currently synchronized scene graph nodes
   */
  getSceneNodes(): SceneNode[];

  /**
   * Update viewport navigation state (pan and zoom)
   */
  updateViewport(viewport: Partial<ViewportTransform>): void;

  /**
   * Get current viewport navigation state
   */
  getViewport(): ViewportTransform;

  /**
   * Set viewport transform handle controls
   */
  setTransformHandles(handles: TransformHandle[]): void;

  /**
   * Get current viewport transform handle controls
   */
  getTransformHandles(): TransformHandle[];

  /**
   * Register event listener
   */
  on(event: string, listener: RendererEventListener): void;

  /**
   * Unregister event listener
   */
  off(event: string, listener: RendererEventListener): void;
}
