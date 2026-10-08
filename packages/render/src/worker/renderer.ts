import type { Keyframe, SceneData, SceneLayer } from "./types.js";

export class OffscreenRenderer {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    width: number,
    height: number,
  ) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;

    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this.ctx = ctx;
  }

  public getCanvas(): OffscreenCanvas | HTMLCanvasElement {
    return this.canvas;
  }

  public setDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public renderFrame(
    scene: SceneData,
    frameIndex: number,
    assets?: Record<string, ImageBitmap | ArrayBuffer>,
  ): void {
    const fps = scene.fps || 30;
    const time = frameIndex / fps;

    // Clear buffer (recycling existing context)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw background
    if (scene.background) {
      this.ctx.fillStyle = scene.background;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Render each layer deterministically
    for (const layer of scene.layers) {
      this.renderLayer(layer, time, assets);
    }
  }

  private renderLayer(
    layer: SceneLayer,
    time: number,
    assets?: Record<string, ImageBitmap | ArrayBuffer>,
  ): void {
    const state = this.interpolateLayerState(layer, time);

    this.ctx.save();

    // Apply layer opacity
    this.ctx.globalAlpha = state.opacity;

    // Apply layer position and scale transform
    this.ctx.translate(state.position[0], state.position[1]);
    this.ctx.scale(state.scale[0], state.scale[1]);

    if (layer.type === "rect" || layer.type === "shape") {
      const size = layer.size || [100, 100];
      const fill = state.fill || layer.fill || "#000000";

      this.ctx.fillStyle = fill;
      this.ctx.fillRect(-size[0] / 2, -size[1] / 2, size[0], size[1]);

      if (layer.stroke && layer.strokeWidth) {
        this.ctx.strokeStyle = layer.stroke;
        this.ctx.lineWidth = layer.strokeWidth;
        this.ctx.strokeRect(-size[0] / 2, -size[1] / 2, size[0], size[1]);
      }
    } else if (layer.type === "text") {
      const text = layer.text || "";
      const fontSize = layer.fontSize || 24;
      const fill = state.fill || layer.fill || "#000000";

      this.ctx.font = `${fontSize}px sans-serif`;
      this.ctx.fillStyle = fill;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(text, 0, 0);
    } else if (layer.type === "image" && layer.assetId && assets) {
      const asset = assets[layer.assetId];
      if (asset && typeof (asset as ImageBitmap).width === "number") {
        const img = asset as ImageBitmap;
        const size = layer.size || [img.width, img.height];
        this.ctx.drawImage(
          img as unknown as CanvasImageSource,
          -size[0] / 2,
          -size[1] / 2,
          size[0],
          size[1],
        );
      }
    }

    this.ctx.restore();
  }

  private interpolateLayerState(
    layer: SceneLayer,
    time: number,
  ): {
    position: [number, number];
    opacity: number;
    scale: [number, number];
    fill?: string | undefined;
  } {
    let position: [number, number] = layer.position;
    let opacity = layer.opacity ?? 1;
    let scale: [number, number] = layer.scale ?? [1, 1];
    let fill: string | undefined = layer.fill;

    if (!layer.keyframes || layer.keyframes.length === 0) {
      return { position, opacity, scale, fill };
    }

    const keyframes = [...layer.keyframes].sort((a, b) => a.time - b.time);

    const firstKf = keyframes[0];
    const lastKf = keyframes[keyframes.length - 1];

    if (!firstKf || !lastKf) {
      return { position, opacity, scale, fill };
    }

    if (keyframes.length === 1) {
      if (time >= firstKf.time) {
        if (firstKf.position) position = firstKf.position;
        if (firstKf.opacity !== undefined) opacity = firstKf.opacity;
        if (firstKf.scale) scale = firstKf.scale;
        if (firstKf.fill) fill = firstKf.fill;
      }
      return { position, opacity, scale, fill };
    }

    // Find surrounding keyframes
    let prev: Keyframe = firstKf;
    let next: Keyframe = lastKf;

    if (time <= prev.time) {
      if (prev.position) position = prev.position;
      if (prev.opacity !== undefined) opacity = prev.opacity;
      if (prev.scale) scale = prev.scale;
      if (prev.fill) fill = prev.fill;
      return { position, opacity, scale, fill };
    }

    if (time >= next.time) {
      if (next.position) position = next.position;
      if (next.opacity !== undefined) opacity = next.opacity;
      if (next.scale) scale = next.scale;
      if (next.fill) fill = next.fill;
      return { position, opacity, scale, fill };
    }

    for (let i = 0; i < keyframes.length - 1; i++) {
      const currKf = keyframes[i];
      const nextItemKf = keyframes[i + 1];
      if (
        currKf &&
        nextItemKf &&
        time >= currKf.time &&
        time <= nextItemKf.time
      ) {
        prev = currKf;
        next = nextItemKf;
        break;
      }
    }

    const duration = next.time - prev.time;
    const progress = duration > 0 ? (time - prev.time) / duration : 1;

    if (prev.position && next.position) {
      position = [
        prev.position[0] + (next.position[0] - prev.position[0]) * progress,
        prev.position[1] + (next.position[1] - prev.position[1]) * progress,
      ];
    } else if (prev.position) {
      position = prev.position;
    }

    if (prev.opacity !== undefined && next.opacity !== undefined) {
      opacity = prev.opacity + (next.opacity - prev.opacity) * progress;
    } else if (prev.opacity !== undefined) {
      opacity = prev.opacity;
    }

    if (prev.scale && next.scale) {
      scale = [
        prev.scale[0] + (next.scale[0] - prev.scale[0]) * progress,
        prev.scale[1] + (next.scale[1] - prev.scale[1]) * progress,
      ];
    } else if (prev.scale) {
      scale = prev.scale;
    }

    if (prev.fill && next.fill) {
      fill = progress > 0.5 ? next.fill : prev.fill;
    }

    return { position, opacity, scale, fill };
  }
}
