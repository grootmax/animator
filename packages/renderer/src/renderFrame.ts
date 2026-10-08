import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getCanvasKit } from "./canvaskit.js";

export interface RenderFrameOptions {
  lottie: string;
  frame: number;
  width?: number;
  height?: number;
  background?: string;
}

function parseHexColor(hex: string): [number, number, number, number] {
  let clean = hex.replace(/^#|^0x/, "");
  if (clean.length === 6) {
    clean += "FF";
  }
  if (clean.length !== 8) {
    return [0x0b, 0x10, 0x20, 0xff];
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const a = Number.parseInt(clean.slice(6, 8), 16);
  return [r, g, b, a];
}

export async function renderFrame(
  options: RenderFrameOptions,
): Promise<Uint8Array> {
  const CK = await getCanvasKit();
  const anim = CK.MakeManagedAnimation(options.lottie);
  if (!anim) {
    throw new Error("Failed to parse Lottie JSON");
  }

  const bounds = anim.size();
  const w = options.width ?? bounds[0] ?? 100;
  const h = options.height ?? bounds[1] ?? 100;

  const surface = CK.MakeSurface(w, h);
  if (!surface) {
    anim.delete();
    throw new Error("Failed to create CanvasKit surface");
  }

  const canvas = surface.getCanvas();
  if (options.background) {
    const [r, g, b, a] = parseHexColor(options.background);
    const color = CK.Color(r, g, b, a / 255);
    canvas.clear(color);
  }

  anim.seekFrame(options.frame);
  anim.render(canvas, CK.LTRBRect(0, 0, w, h));
  surface.flush();

  const img = surface.makeImageSnapshot();
  const bytes = img.encodeToBytes();

  img.delete();
  surface.delete();
  anim.delete();

  if (!bytes) {
    throw new Error("Failed to encode frame snapshot to PNG");
  }

  return bytes;
}

// CLI runner when called directly
if (process.argv[1]?.includes("renderFrame")) {
  const fixtureName = process.argv[2] || "hello-dot";
  const frame = Number.parseInt(process.argv[3] || "15", 10);

  (async () => {
    try {
      const fixturePath = resolve(
        process.cwd(),
        `fixtures/${fixtureName}.json`,
      );
      const lottie = await readFile(fixturePath, "utf-8");
      const pngBytes = await renderFrame({
        lottie,
        frame,
        width: 100,
        height: 100,
        background: "#0B1020",
      });

      const outDir = resolve(process.cwd(), "renders");
      await mkdir(outDir, { recursive: true });
      const outFile = resolve(outDir, `${fixtureName}-${frame}.png`);
      await writeFile(outFile, pngBytes);
      console.log(`Rendered frame ${frame} of ${fixtureName} to ${outFile}`);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}
