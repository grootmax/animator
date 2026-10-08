import type { MotionDoc } from "@animator/core";

export const RENDER_VERSION = "0.0.0";

export interface RenderedFrame {
  timeSec: number;
  frameIndex: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface ContactSheetResult {
  layout: "contact_sheet" | "frames" | "gif";
  frameCount: number;
  frames: RenderedFrame[];
  contactSheetUrl?: string | undefined;
}

export async function renderPreview(
  doc: MotionDoc,
  options: {
    times?: number[] | undefined;
    count?: number | undefined;
    layout?: "contact_sheet" | "frames" | "gif" | undefined;
    size?: number | undefined;
  } = {},
): Promise<ContactSheetResult> {
  const fps = doc.canvas.fps || 30;
  const duration = doc.canvas.duration || 4;
  const width = options.size || 512;
  const height = Math.round(
    (width * (doc.canvas.height || 1080)) / (doc.canvas.width || 1080),
  );
  const layout = options.layout || "contact_sheet";

  let renderTimes: number[] = [];
  if (options.times && options.times.length > 0) {
    renderTimes = options.times;
  } else {
    const count = options.count || 4;
    const step = duration / Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
      renderTimes.push(Number((i * step).toFixed(2)));
    }
  }

  const frames: RenderedFrame[] = renderTimes.map((t) => {
    const frameIndex = Math.round(t * fps);
    const transparentPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    return {
      timeSec: t,
      frameIndex,
      width,
      height,
      dataUrl: transparentPng,
    };
  });

  return {
    layout,
    frameCount: frames.length,
    frames,
    contactSheetUrl: frames[0]?.dataUrl,
  };
}
