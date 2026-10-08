import type { Image, Surface } from "canvaskit-wasm";
import { getCanvasKit } from "./canvaskit.js";

export interface RenderFrameOptions {
  /** Lottie JSON string or parsed Lottie JSON object */
  lottie: string | object;
  /** Frame index to render */
  frame: number;
  /** Optional surface width in pixels (defaults to Lottie width or 100) */
  width?: number;
  /** Optional surface height in pixels (defaults to Lottie height or 100) */
  height?: number;
  /** Background color in hex or CSS format (defaults to "#0B1020") */
  background?: string;
}

/**
 * Renders a single frame of a Lottie animation using Skottie in CanvasKit.
 * Explicitly manages Wasm memory by deleting surfaces, animations, and image snapshots.
 * Returns PNG bytes as a Uint8Array.
 */
export async function renderFrame(
  options: RenderFrameOptions,
): Promise<Uint8Array> {
  const { lottie, frame, background = "#0B1020" } = options;
  const lottieStr =
    typeof lottie === "string" ? lottie : JSON.stringify(lottie);

  const CK = await getCanvasKit();
  const anim = CK.MakeManagedAnimation(lottieStr);
  if (!anim) {
    throw new Error(
      "Failed to initialize Skottie animation from Lottie payload",
    );
  }

  let renderWidth = options.width;
  let renderHeight = options.height;

  if (!renderWidth || !renderHeight) {
    try {
      const parsed = typeof lottie === "string" ? JSON.parse(lottie) : lottie;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "w" in parsed &&
        "h" in parsed
      ) {
        if (!renderWidth && typeof parsed.w === "number")
          renderWidth = parsed.w;
        if (!renderHeight && typeof parsed.h === "number")
          renderHeight = parsed.h;
      }
    } catch {
      // Ignore JSON parse errors and fallback
    }
  }

  renderWidth = renderWidth ?? 100;
  renderHeight = renderHeight ?? 100;

  const surface: Surface | null = CK.MakeSurface(renderWidth, renderHeight);
  if (!surface) {
    anim.delete();
    throw new Error(
      `Failed to create CanvasKit surface (${renderWidth}x${renderHeight})`,
    );
  }

  let imageSnapshot: Image | null = null;

  try {
    const canvas = surface.getCanvas();
    const bg = CK.parseColorString(background);
    canvas.clear(bg);

    anim.seekFrame(frame);
    anim.render(canvas, CK.LTRBRect(0, 0, renderWidth, renderHeight));

    surface.flush();
    imageSnapshot = surface.makeImageSnapshot();

    if (!imageSnapshot) {
      throw new Error("Failed to create image snapshot from surface");
    }

    const bytes = imageSnapshot.encodeToBytes();
    if (!bytes) {
      throw new Error("Failed to encode image snapshot to PNG bytes");
    }

    return bytes;
  } finally {
    if (imageSnapshot) {
      imageSnapshot.delete();
    }
    surface.delete();
    anim.delete();
  }
}
