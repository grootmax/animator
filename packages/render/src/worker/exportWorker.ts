import { WebCodecsEncoder } from "./encoder.js";
import { OffscreenRenderer } from "./renderer.js";
import type {
  ExportMessageFromWorker,
  ExportMessageToWorker,
  WorkerInitMessage,
} from "./types.js";

function createHeadlessCanvas(
  width: number,
  height: number,
): HTMLCanvasElement {
  const pixelData = new Uint8ClampedArray(width * height * 4);
  const ctx = {
    clearRect: () => pixelData.fill(0),
    fillRect: () => pixelData.fill(255),
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    fillText: () => {},
    strokeRect: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: pixelData, width, height }),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  };

  return {
    width,
    height,
    getContext: (type: string) => (type === "2d" ? ctx : null),
  } as unknown as HTMLCanvasElement;
}

export class ExportWorkerController {
  private isCancelled = false;
  private postMessageFn: (
    message: ExportMessageFromWorker,
    transfer?: Transferable[],
  ) => void;

  constructor(
    postMessageFn: (
      message: ExportMessageFromWorker,
      transfer?: Transferable[],
    ) => void,
  ) {
    this.postMessageFn = postMessageFn;
  }

  public async handleMessage(message: ExportMessageToWorker): Promise<void> {
    if (message.type === "cancel") {
      this.isCancelled = true;
      return;
    }

    if (message.type === "init") {
      await this.runExport(message);
    }
  }

  private async runExport(message: WorkerInitMessage): Promise<void> {
    const startTime = Date.now();
    this.isCancelled = false;

    const { sceneData, options, assets } = message;
    const width = options.width || sceneData.width;
    const height = options.height || sceneData.height;
    const fps = options.fps || sceneData.fps || 30;
    const duration = options.duration || sceneData.duration;
    const totalFrames = Math.max(1, Math.ceil(duration * fps));

    try {
      // 1. Get, create or fallback canvas
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      if (message.canvas) {
        canvas = message.canvas;
      } else if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(width, height);
      } else if (
        typeof document !== "undefined" &&
        typeof document.createElement === "function"
      ) {
        canvas = document.createElement("canvas");
      } else {
        canvas = createHeadlessCanvas(width, height);
      }

      // 2. Initialize OffscreenRenderer & WebCodecsEncoder
      const renderer = new OffscreenRenderer(canvas, width, height);

      let chunkCount = 0;
      const encoder = new WebCodecsEncoder({
        width,
        height,
        fps,
        codec: options.codec,
        bitrate: options.bitrate,
        onChunk: (
          chunk: ArrayBuffer,
          timestamp: number,
          isKeyFrame: boolean,
        ) => {
          chunkCount++;
          this.postMessageFn(
            {
              type: "chunk",
              data: chunk,
              timestamp,
              isKeyFrame,
            },
            [chunk],
          );
        },
      });

      await encoder.init();

      // 3. Deterministic frame stepping loop
      const keyFrameInterval = fps * 2; // Insert keyframe every 2 seconds

      for (let frame = 0; frame < totalFrames; frame++) {
        if (this.isCancelled) {
          this.postMessageFn({
            type: "error",
            error: "Export cancelled by user",
          });
          await encoder.close();
          return;
        }

        // Render frame onto recycled buffer
        renderer.renderFrame(sceneData, frame, assets);

        // Encode frame
        const isKeyFrame = frame % keyFrameInterval === 0;
        await encoder.encodeFrame(renderer.getCanvas(), frame, isKeyFrame);

        // Post progress update
        const percent = Math.round(((frame + 1) / totalFrames) * 100);
        this.postMessageFn({
          type: "progress",
          frame: frame + 1,
          totalFrames,
          percent,
        });

        // Yield to allow message loop responsiveness
        if (frame % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      await encoder.flush();
      await encoder.close();

      const durationMs = Date.now() - startTime;
      this.postMessageFn({
        type: "complete",
        totalFrames,
        durationMs,
        chunksCount: chunkCount,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.postMessageFn({
        type: "error",
        error: errorMessage,
      });
    }
  }
}

/**
 * Global worker message listener initialization for Web Worker context.
 */
export function initWorkerGlobal(): void {
  if (typeof self !== "undefined" && typeof self.postMessage === "function") {
    const controller = new ExportWorkerController((message, transfer) => {
      if (transfer) {
        self.postMessage(message, { transfer });
      } else {
        self.postMessage(message);
      }
    });

    self.onmessage = (event: MessageEvent<ExportMessageToWorker>) => {
      controller.handleMessage(event.data);
    };
  }
}
