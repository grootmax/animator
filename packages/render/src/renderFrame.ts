import { parseColor } from "./bridge.js";
import { getCanvasKit } from "./canvaskit.js";

export interface RenderFrameOptions {
  lottie: string;
  frame: number;
  width: number;
  height: number;
  background?: string;
}

export async function renderFrame({
  lottie,
  frame,
  width,
  height,
  background = "#0B1020",
}: RenderFrameOptions): Promise<Uint8Array> {
  const ck = await getCanvasKit();
  const surface = ck.MakeSurface(width, height);
  if (!surface) {
    throw new Error("Failed to create CanvasKit surface");
  }

  const canvas = surface.getCanvas();

  // Clear background
  const bgPaint = new ck.Paint();
  const bgColor = parseColor(background, 1.0);
  bgPaint.setColor(ck.Color4f(bgColor[0], bgColor[1], bgColor[2], bgColor[3]));
  bgPaint.setStyle(ck.PaintStyle.Fill);
  canvas.drawRect(ck.LTRBRect(0, 0, width, height), bgPaint);
  bgPaint.delete();

  // Load and render Lottie animation
  const anim = ck.MakeManagedAnimation(lottie);
  if (!anim) {
    surface.delete();
    throw new Error("Failed to load Lottie animation");
  }

  anim.seekFrame(frame);
  anim.render(canvas, ck.LTRBRect(0, 0, width, height));

  surface.flush();

  const image = surface.makeImageSnapshot();
  if (!image) {
    anim.delete();
    surface.delete();
    throw new Error("Failed to create image snapshot");
  }

  const bytes = image.encodeToBytes(); // PNG bytes

  image.delete();
  anim.delete();
  surface.delete();

  if (!bytes) {
    throw new Error("Failed to encode image to PNG bytes");
  }

  return bytes;
}
