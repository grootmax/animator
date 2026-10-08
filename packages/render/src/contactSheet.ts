import { getCanvasKit } from "./canvaskit.js";
import { SkottieAnimation } from "./renderFrame.js";

export interface ContactSheetOptions {
  lottie: string | object;
  cols?: number;
  rows?: number;
  frameCount?: number;
  frameIndices?: number[];
  width?: number;
  height?: number;
  tileWidth?: number;
  tileHeight?: number;
  background?: string;
}

export async function renderContactSheet(
  options: ContactSheetOptions,
): Promise<Uint8Array> {
  const ck = await getCanvasKit();
  const wrapper = new SkottieAnimation(ck, options.lottie);

  try {
    let frameIndices: number[];
    if (options.frameIndices && options.frameIndices.length > 0) {
      frameIndices = options.frameIndices;
    } else {
      const count = options.frameCount ?? 16;
      const maxFrame = Math.max(0, wrapper.totalFrames - 1);
      if (count <= 1) {
        frameIndices = [0];
      } else {
        frameIndices = Array.from({ length: count }, (_, i) =>
          Math.round((i * maxFrame) / (count - 1)),
        );
      }
    }

    const totalSamples = frameIndices.length;
    let cols = options.cols;
    let rows = options.rows;

    if (!cols && !rows) {
      cols = 4;
      rows = Math.ceil(totalSamples / cols);
    } else if (!cols && rows) {
      cols = Math.ceil(totalSamples / rows);
    } else if (cols && !rows) {
      rows = Math.ceil(totalSamples / cols);
    }

    cols = Math.max(1, cols ?? 1);
    rows = Math.max(1, rows ?? 1);

    let tileW = options.tileWidth;
    let tileH = options.tileHeight;

    if (!tileW || !tileH) {
      if (options.width && options.height) {
        tileW = Math.floor(options.width / cols);
        tileH = Math.floor(options.height / rows);
      } else {
        tileW = wrapper.width;
        tileH = wrapper.height;
      }
    }

    const sheetW = cols * tileW;
    const sheetH = rows * tileH;

    const surface = ck.MakeSurface(sheetW, sheetH);
    if (!surface) {
      throw new Error(
        `Failed to create contact sheet surface (${sheetW}x${sheetH})`,
      );
    }

    const canvas = surface.getCanvas();
    const bg = options.background ?? "#0B1020";
    const bgColor = ck.parseColorString(bg);
    if (bgColor) {
      canvas.clear(bgColor);
    } else {
      canvas.clear(ck.Color(0, 0, 0, 0));
    }

    for (let i = 0; i < totalSamples; i++) {
      if (i >= rows * cols) break;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const frameIndex = frameIndices[i] ?? 0;

      wrapper.seekFrame(frameIndex);

      const destRect = ck.LTRBRect(
        c * tileW,
        r * tileH,
        (c + 1) * tileW,
        (r + 1) * tileH,
      );

      wrapper.renderToCanvas(canvas, destRect);
    }

    surface.flush();
    const img = surface.makeImageSnapshot();
    const pngBytes = img.encodeToBytes();

    img.delete();
    surface.delete();

    if (!pngBytes) {
      throw new Error("Failed to encode contact sheet image to PNG bytes");
    }

    return pngBytes;
  } finally {
    wrapper.delete();
  }
}
