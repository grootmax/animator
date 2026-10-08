import type { SceneNode } from "@animator/core";
import type { SceneGraphStore } from "@animator/core";

export interface DisplayObject {
  id: string;
  type: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width?: number | undefined;
  height?: number | undefined;
  fill?: string | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  matrix?: number[] | undefined;
  children: DisplayObject[];
  dirty: boolean;
}

export interface RenderCanvasContext {
  clearRect?: (x: number, y: number, w: number, h: number) => void;
  save?: () => void;
  restore?: () => void;
  fillRect?: (x: number, y: number, w: number, h: number) => void;
  globalAlpha?: number;
  fillStyle?: string;
  [key: string]: unknown;
}

export interface RenderCanvas {
  width?: number;
  height?: number;
  getContext?: (contextId: string) => RenderCanvasContext | null;
  toDataURL?: (type?: string) => string;
  [key: string]: unknown;
}

export interface TextureRef {
  destroy?: (destroyBase?: boolean) => void;
  [key: string]: unknown;
}

export class PixiBridge {
  public store: SceneGraphStore;
  public canvas: RenderCanvas;
  public stage: DisplayObject;
  public displayObjects: Map<string, DisplayObject> = new Map();
  private textures: Map<string, TextureRef> = new Map();
  private microtasksBypassedCount = 0;
  private isOffline = false;
  private unsubscribeStore?: () => void;

  constructor(store: SceneGraphStore, canvas?: RenderCanvas) {
    this.store = store;
    this.canvas = canvas || this.createMockCanvas();
    this.stage = {
      id: "stage",
      type: "stage",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      children: [],
      dirty: false,
    };

    this.unsubscribeStore = this.store.subscribe(() => {
      if (this.isOffline) {
        return;
      }
    });
  }

  public setOfflineMode(offline: boolean): void {
    this.isOffline = offline;
  }

  public isOfflineMode(): boolean {
    return this.isOffline;
  }

  /**
   * REQUIREMENT 3: Updates display objects from the store SYNCHRONOUSLY
   * without queuing microtasks (no queueMicrotask, no Promise.then, no rAF).
   * Does NOT mutate scene graph data in store.
   */
  public flushSync(): void {
    this.microtasksBypassedCount++;
    const state = this.store.getState();
    this.syncDisplayObjects(state.nodes);
  }

  public flush(): void {
    this.flushSync();
  }

  /**
   * REQUIREMENT 4: Direct frame render function that forces immediate
   * stage compilation and canvas redraw synchronously.
   */
  public renderFrame(): void {
    this.flushSync();
    this.compileStage();
    this.redrawCanvas();
    this.releaseFrameTextures();
  }

  public renderDirect(): void {
    this.renderFrame();
  }

  /**
   * Releases intermediate texture references per frame to keep
   * memory consumption stable during long frame capture loops.
   */
  public releaseFrameTextures(): void {
    for (const [, texture] of this.textures.entries()) {
      if (texture && typeof texture.destroy === "function") {
        texture.destroy(true);
      }
    }
    this.textures.clear();
  }

  public getMicrotasksBypassedCount(): number {
    return this.microtasksBypassedCount;
  }

  private syncDisplayObjects(nodes: Record<string, SceneNode>): void {
    const currentIds = new Set(Object.keys(nodes));

    for (const [id] of this.displayObjects.entries()) {
      if (!currentIds.has(id)) {
        this.displayObjects.delete(id);
      }
    }

    for (const [id, node] of Object.entries(nodes)) {
      let displayObj = this.displayObjects.get(id);

      if (!displayObj) {
        displayObj = {
          id: node.id || id,
          type: node.type || "node",
          visible: node.visible !== false,
          opacity: node.opacity ?? 1,
          x: node.x ?? 0,
          y: node.y ?? 0,
          width: node.width,
          height: node.height,
          fill: node.fill,
          stroke: node.stroke,
          strokeWidth: node.strokeWidth,
          matrix: node.localMatrix,
          children: [],
          dirty: true,
        };
        this.displayObjects.set(id, displayObj);
      } else {
        displayObj.visible = node.visible !== false;
        displayObj.opacity = node.opacity ?? 1;
        displayObj.x = node.x ?? 0;
        displayObj.y = node.y ?? 0;
        displayObj.width = node.width;
        displayObj.height = node.height;
        displayObj.fill = node.fill;
        displayObj.stroke = node.stroke;
        displayObj.strokeWidth = node.strokeWidth;
        displayObj.matrix = node.localMatrix;
        displayObj.dirty = true;
      }
    }

    const validChildren: DisplayObject[] = [];
    for (const obj of this.displayObjects.values()) {
      if (obj) {
        validChildren.push(obj);
      }
    }
    this.stage.children = validChildren;
  }

  private compileStage(): void {
    for (const child of this.stage.children) {
      child.dirty = false;
    }
  }

  private redrawCanvas(): void {
    if (this.canvas && typeof this.canvas.getContext === "function") {
      const ctx = this.canvas.getContext("2d");
      if (ctx) {
        if (typeof ctx.clearRect === "function") {
          ctx.clearRect(
            0,
            0,
            this.canvas.width || 800,
            this.canvas.height || 600,
          );
        }
        for (const child of this.stage.children) {
          if (!child.visible) continue;
          if (typeof ctx.save === "function") ctx.save();
          if ("globalAlpha" in ctx) ctx.globalAlpha = child.opacity;
          if (child.fill && "fillStyle" in ctx) {
            ctx.fillStyle = child.fill;
            if (typeof ctx.fillRect === "function") {
              ctx.fillRect(
                child.x,
                child.y,
                child.width || 100,
                child.height || 100,
              );
            }
          }
          if (typeof ctx.restore === "function") ctx.restore();
        }
      }
    }
  }

  private createMockCanvas(): RenderCanvas {
    return {
      width: 800,
      height: 600,
      getContext: () => ({
        clearRect: () => {},
        save: () => {},
        restore: () => {},
        fillRect: () => {},
      }),
      toDataURL: (type = "image/png") => `data:${type};base64,mockFrameData`,
    };
  }

  public destroy(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
    }
    this.releaseFrameTextures();
    this.displayObjects.clear();
  }
}

export const RendererBridge = PixiBridge;
