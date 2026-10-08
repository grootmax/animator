import { type CanvasKit, getCanvasKit } from "./canvaskit.js";

export interface RenderFrameOptions {
  lottie: string | object;
  frame?: number;
  time?: number;
  width?: number;
  height?: number;
  background?: string;
}

type ManagedAnimation = ReturnType<CanvasKit["MakeManagedAnimation"]>;
type CanvasKitSurface = NonNullable<ReturnType<CanvasKit["MakeSurface"]>>;

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
        "Failed to load Lottie animation: invalid JSON string or schema",
      );
    }
    const size = this.anim.size();
    this.width = size[0] || 512;
    this.height = size[1] || 512;
    this.duration = this.anim.duration() || 1;
    this.fps = this.anim.fps() || 30;
    this.totalFrames = Math.max(1, Math.round(this.duration * this.fps));
  }

  seekFrame(frameIndex: number): void {
    if (this.totalFrames > 0) {
      this.anim.seek(frameIndex / this.totalFrames);
    } else {
      this.anim.seekFrame(frameIndex);
    }
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
    background?: string,
  ): CanvasKitSurface {
    const surface = this.ck.MakeSurface(width, height);
    if (!surface) {
      throw new Error(
        `Failed to create CanvasKit surface (${width}x${height})`,
      );
    }
    const canvas = surface.getCanvas();
    if (background) {
      const color = this.ck.parseColorString(background);
      if (color) {
        canvas.clear(color);
      }
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
    background?: string,
  ): Uint8Array {
    const surface = this.renderToSurface(width, height, background);
    const img = surface.makeImageSnapshot();
    const bytes = img.encodeToBytes();
    img.delete();
    surface.delete();
    if (!bytes) {
      throw new Error("Failed to encode CanvasKit image snapshot to PNG bytes");
    }
    return bytes;
  }

  delete(): void {
    if (this.anim) {
      this.anim.delete();
    }
  }
}

export async function renderFrame(
  options: RenderFrameOptions,
): Promise<Uint8Array> {
  const ck = await getCanvasKit();
  const wrapper = new SkottieAnimation(ck, options.lottie);
  try {
    if (options.time !== undefined) {
      wrapper.seekTime(options.time);
    } else {
      wrapper.seekFrame(options.frame ?? 0);
    }
    const width = options.width ?? wrapper.width;
    const height = options.height ?? wrapper.height;
    return wrapper.renderToPng(width, height, options.background);
  } finally {
    wrapper.delete();
  }
}
