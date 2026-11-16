import type { CanvasKit, Image, Surface } from "canvaskit-wasm";
import { getCanvasKit } from "./canvaskit.js";

export interface RenderFrameOptions {
  /** Lottie JSON string or parsed Lottie JSON object */
  lottie: string | object;
  /** Frame index to render (defaults to 0) */
  frame?: number;
  /** Time in seconds to seek to (alternative to frame) */
  time?: number;
  /** Surface width in pixels (defaults to Lottie width or 100) */
  width?: number;
  /** Surface height in pixels (defaults to Lottie height or 100) */
  height?: number;
  /** Background color in hex or CSS format (defaults to "#0B1020") */
  background?: string;
}

export type ManagedAnimation = ReturnType<CanvasKit["MakeManagedAnimation"]>;

/**
 * Wrapper class around CanvasKit's Skottie ManagedAnimation to handle frame seeking and rendering.
 */
export class SkottieAnimation {
  private anim: ManagedAnimation;
  private ck: CanvasKit;
  public width: number;
  public height: number;
  public duration: number;
  public fps: number;
  public totalFrames: number;

  constructor(ck: CanvasKit, lottie: string | object) {
    this.ck = ck;
    const jsonStr =
      typeof lottie === "string" ? lottie : JSON.stringify(lottie);
    this.anim = ck.MakeManagedAnimation(jsonStr);
    if (!this.anim) {
      throw new Error(
        "Failed to initialize Skottie animation from Lottie payload",
      );
    }
    const size = this.anim.size();
    this.width = size?.[0] || 100;
    this.height = size?.[1] || 100;
    this.duration = this.anim.duration() || 1;
    this.fps = this.anim.fps() || 30;
    this.totalFrames = Math.max(1, Math.round(this.duration * this.fps));
  }

  seekFrame(frameIndex: number): void {
    this.anim.seekFrame(frameIndex);
  }

  seekTime(timeInSeconds: number): void {
    if (this.duration > 0) {
      this.anim.seek(timeInSeconds / this.duration);
    } else {
      this.anim.seek(0);
    }
  }

  renderToCanvas(canvas: unknown, destRect: unknown): void {
    this.anim.render(
      canvas as Parameters<ManagedAnimation["render"]>[0],
      destRect as Parameters<ManagedAnimation["render"]>[1],
    );
  }

  renderToSurface(
    width = this.width,
    height = this.height,
    background = "#0B1020",
  ): Surface {
    const surface = this.ck.MakeSurface(width, height);
    if (!surface) {
      throw new Error(
        `Failed to create CanvasKit surface (${width}x${height})`,
      );
    }
    const canvas = surface.getCanvas();
    const bg = this.ck.parseColorString(background);
    if (bg) {
      canvas.clear(bg);
    } else {
      canvas.clear(this.ck.Color(0, 0, 0, 0));
    }
    const bounds = this.ck.LTRBRect(0, 0, width, height);
    this.anim.render(canvas, bounds);
    surface.flush();
    return surface;
  }

  renderToPng(
    width = this.width,
    height = this.height,
    background = "#0B1020",
  ): Uint8Array {
    const surface = this.renderToSurface(width, height, background);
    let img: Image | null = null;
    try {
      img = surface.makeImageSnapshot();
      if (!img) {
        throw new Error("Failed to create image snapshot from surface");
      }
      const bytes = img.encodeToBytes();
      if (!bytes) {
        throw new Error("Failed to encode image snapshot to PNG bytes");
      }
      return bytes;
    } finally {
      if (img) {
        img.delete();
      }
      surface.delete();
    }
  }

  delete(): void {
    if (this.anim) {
      this.anim.delete();
    }
  }
}

/**
 * Renders a single frame of a Lottie animation using Skottie in CanvasKit.
 * Explicitly manages Wasm memory by deleting surfaces, animations, and image snapshots.
 * Returns PNG bytes as a Uint8Array.
 */
export async function renderFrame(
  options: RenderFrameOptions,
): Promise<Uint8Array> {
  const { lottie, frame, time, background = "#0B1020" } = options;

  const ck = await getCanvasKit();
  const wrapper = new SkottieAnimation(ck, lottie);

  try {
    if (time !== undefined) {
      wrapper.seekTime(time);
    } else {
      wrapper.seekFrame(frame ?? 0);
    }

    const width = options.width ?? wrapper.width;
    const height = options.height ?? wrapper.height;

    return wrapper.renderToPng(width, height, background);
  } finally {
    wrapper.delete();
  }
}
