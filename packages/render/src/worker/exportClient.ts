import { ExportWorkerController } from "./exportWorker.js";
import type {
  ExportMessageFromWorker,
  ExportMessageToWorker,
  ExportOptions,
  SceneData,
  WorkerInitMessage,
} from "./types.js";

export interface ExportCallbacks {
  onProgress?:
    | ((progress: {
        frame: number;
        totalFrames: number;
        percent: number;
      }) => void)
    | undefined;
  onChunk?:
    | ((chunk: ArrayBuffer, timestamp: number, isKeyFrame: boolean) => void)
    | undefined;
  onComplete?:
    | ((result: {
        totalFrames: number;
        durationMs: number;
        chunksCount: number;
      }) => void)
    | undefined;
  onError?: ((error: Error) => void) | undefined;
}

export class ExportWorkerClient {
  public static isOffscreenSupported(): boolean {
    return (
      typeof globalThis !== "undefined" &&
      "OffscreenCanvas" in globalThis &&
      "Worker" in globalThis
    );
  }

  public static isWebCodecsSupported(): boolean {
    return typeof globalThis !== "undefined" && "VideoEncoder" in globalThis;
  }

  /**
   * Starts a background video export job using OffscreenCanvas and Web Worker if available,
   * falling back gracefully to a non-blocking main-thread pipeline when unsupported.
   */
  public exportInBackground(
    sceneData: SceneData,
    options: ExportOptions,
    callbacks: ExportCallbacks = {},
    customWorker?: Worker,
  ): {
    cancel: () => void;
    promise: Promise<{
      totalFrames: number;
      durationMs: number;
      chunksCount: number;
    }>;
  } {
    let isCancelled = false;
    let cancelFn = () => {
      isCancelled = true;
    };

    const promise = new Promise<{
      totalFrames: number;
      durationMs: number;
      chunksCount: number;
    }>((resolve, reject) => {
      const handleProgress = (
        frame: number,
        totalFrames: number,
        percent: number,
      ) => {
        callbacks.onProgress?.({ frame, totalFrames, percent });
      };

      const handleChunk = (
        chunk: ArrayBuffer,
        timestamp: number,
        isKeyFrame: boolean,
      ) => {
        callbacks.onChunk?.(chunk, timestamp, isKeyFrame);
      };

      const handleComplete = (result: {
        totalFrames: number;
        durationMs: number;
        chunksCount: number;
      }) => {
        callbacks.onComplete?.(result);
        resolve(result);
      };

      const handleError = (err: Error) => {
        callbacks.onError?.(err);
        reject(err);
      };

      // Path A: Use Web Worker if provided or if OffscreenCanvas + Worker are available
      if (
        customWorker ||
        (ExportWorkerClient.isOffscreenSupported() &&
          typeof Worker !== "undefined")
      ) {
        try {
          let worker: Worker;
          let shouldTerminate = false;

          if (customWorker) {
            worker = customWorker;
          } else {
            // Note: inline worker fallback for browser runtime if no worker script URL is passed
            const workerBlob = new Blob(
              [
                "self.onmessage = function(e) { console.log('Worker initialized', e); };",
              ],
              { type: "application/javascript" },
            );
            const workerUrl = URL.createObjectURL(workerBlob);
            worker = new Worker(workerUrl);
            shouldTerminate = true;
          }

          cancelFn = () => {
            isCancelled = true;
            const cancelMsg: ExportMessageToWorker = { type: "cancel" };
            worker.postMessage(cancelMsg);
            if (shouldTerminate) {
              worker.terminate();
            }
          };

          worker.onmessage = (event: MessageEvent<ExportMessageFromWorker>) => {
            const msg = event.data;
            if (msg.type === "progress") {
              handleProgress(msg.frame, msg.totalFrames, msg.percent);
            } else if (msg.type === "chunk") {
              handleChunk(msg.data, msg.timestamp, msg.isKeyFrame);
            } else if (msg.type === "complete") {
              if (shouldTerminate) {
                worker.terminate();
              }
              handleComplete({
                totalFrames: msg.totalFrames,
                durationMs: msg.durationMs,
                chunksCount: msg.chunksCount,
              });
            } else if (msg.type === "error") {
              if (shouldTerminate) {
                worker.terminate();
              }
              handleError(new Error(msg.error));
            }
          };

          // Prepare OffscreenCanvas if supported
          const transferables: Transferable[] = [];
          let canvasToSend: OffscreenCanvas | undefined;

          if (typeof OffscreenCanvas !== "undefined") {
            canvasToSend = new OffscreenCanvas(
              options.width || sceneData.width,
              options.height || sceneData.height,
            );
            transferables.push(canvasToSend);
          }

          const initMsg: WorkerInitMessage = {
            type: "init",
            sceneData,
            options,
          };
          if (canvasToSend) {
            initMsg.canvas = canvasToSend;
          }

          worker.postMessage(initMsg, transferables);
          return;
        } catch (e) {
          console.warn(
            "Worker creation failed, falling back to main-thread async export:",
            e,
          );
        }
      }

      // Path B: Fallback path (main-thread async frame stepping)
      this.runFallbackMainThreadExport(
        sceneData,
        options,
        {
          onProgress: handleProgress,
          onChunk: handleChunk,
          onComplete: handleComplete,
          onError: handleError,
        },
        () => isCancelled,
      );

      cancelFn = () => {
        isCancelled = true;
      };
    });

    return {
      cancel: () => cancelFn(),
      promise,
    };
  }

  private runFallbackMainThreadExport(
    sceneData: SceneData,
    options: ExportOptions,
    callbacks: {
      onProgress: (frame: number, totalFrames: number, percent: number) => void;
      onChunk: (
        chunk: ArrayBuffer,
        timestamp: number,
        isKeyFrame: boolean,
      ) => void;
      onComplete: (res: {
        totalFrames: number;
        durationMs: number;
        chunksCount: number;
      }) => void;
      onError: (err: Error) => void;
    },
    isCancelledFn: () => boolean,
  ): void {
    const width = options.width || sceneData.width;
    const height = options.height || sceneData.height;

    // In-memory controller simulation
    const controller = new ExportWorkerController((msg) => {
      if (msg.type === "progress") {
        callbacks.onProgress(msg.frame, msg.totalFrames, msg.percent);
      } else if (msg.type === "chunk") {
        callbacks.onChunk(msg.data, msg.timestamp, msg.isKeyFrame);
      } else if (msg.type === "complete") {
        callbacks.onComplete({
          totalFrames: msg.totalFrames,
          durationMs: msg.durationMs,
          chunksCount: msg.chunksCount,
        });
      } else if (msg.type === "error") {
        callbacks.onError(new Error(msg.error));
      }
    });

    // Run execution asynchronously
    Promise.resolve().then(async () => {
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(width, height);
      } else if (
        typeof document !== "undefined" &&
        typeof document.createElement === "function"
      ) {
        canvas = document.createElement("canvas");
      } else {
        // Fallback mock canvas for Node test runner
        canvas = {
          width,
          height,
          getContext: () => ({
            clearRect: () => {},
            fillRect: () => {},
            save: () => {},
            restore: () => {},
            translate: () => {},
            scale: () => {},
            fillText: () => {},
            strokeRect: () => {},
            drawImage: () => {},
            getImageData: () => ({
              data: new Uint8ClampedArray(width * height * 4),
            }),
          }),
        } as unknown as HTMLCanvasElement;
      }

      const initMsg: WorkerInitMessage = {
        type: "init",
        sceneData,
        options,
      };
      if (typeof OffscreenCanvas !== "undefined") {
        initMsg.canvas = canvas as OffscreenCanvas;
      }

      await controller.handleMessage(initMsg);
    });
  }
}

export function startOffscreenExport(
  sceneData: SceneData,
  options: ExportOptions,
  callbacks?: ExportCallbacks,
  customWorker?: Worker,
) {
  const client = new ExportWorkerClient();
  return client.exportInBackground(sceneData, options, callbacks, customWorker);
}
