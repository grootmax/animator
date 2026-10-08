import type { WorkerAdapter, WorkerTaskHandler } from "./types.js";

/**
 * In-memory synchronous fallback worker adapter.
 * Executes processing directly on the main thread using microtasks,
 * preventing worker missing exceptions in browser/fallback mode.
 */
export class SyncWorkerAdapter<TInput = unknown, TOutput = unknown>
  implements WorkerAdapter<TInput, TOutput>
{
  private handlers: Array<(data: TOutput) => void> = [];
  private taskHandler: WorkerTaskHandler<TInput, TOutput>;
  private terminated = false;

  constructor(handler: WorkerTaskHandler<TInput, TOutput>) {
    this.taskHandler = handler;
  }

  public postMessage(message: TInput): void {
    if (this.terminated) return;

    queueMicrotask(async () => {
      if (this.terminated) return;
      try {
        const result = await this.taskHandler(message);
        if (!this.terminated) {
          for (const handler of this.handlers) {
            handler(result);
          }
        }
      } catch (err) {
        console.error("Error in SyncWorkerAdapter handler:", err);
      }
    });
  }

  public onMessage(handler: (data: TOutput) => void): void {
    this.handlers.push(handler);
  }

  public terminate(): void {
    this.terminated = true;
    this.handlers = [];
  }

  public isSynchronous(): boolean {
    return true;
  }
}

/**
 * Web Worker wrapper adapter delegating to standard Web Worker API.
 */
export class AsyncWorkerAdapter<TInput = unknown, TOutput = unknown>
  implements WorkerAdapter<TInput, TOutput>
{
  private worker: Worker;
  private handlers: Array<(data: TOutput) => void> = [];

  constructor(scriptUrl: string) {
    this.worker = new Worker(scriptUrl, { type: "module" });
    this.worker.onmessage = (event: MessageEvent<TOutput>) => {
      for (const handler of this.handlers) {
        handler(event.data);
      }
    };
  }

  public postMessage(message: TInput): void {
    this.worker.postMessage(message);
  }

  public onMessage(handler: (data: TOutput) => void): void {
    this.handlers.push(handler);
  }

  public terminate(): void {
    this.worker.terminate();
    this.handlers = [];
  }

  public isSynchronous(): boolean {
    return false;
  }
}

/**
 * Factory to create worker adapter with fallback to synchronous execution.
 */
export function createWorkerAdapter<TInput = unknown, TOutput = unknown>(
  handler: WorkerTaskHandler<TInput, TOutput>,
  scriptUrl?: string,
  forceSync = false,
): WorkerAdapter<TInput, TOutput> {
  const supportsWorker =
    typeof window !== "undefined" && typeof window.Worker !== "undefined";

  if (!forceSync && supportsWorker && scriptUrl) {
    try {
      return new AsyncWorkerAdapter<TInput, TOutput>(scriptUrl);
    } catch {
      // Fallback to SyncWorkerAdapter if Worker instantiation fails (e.g. CORS/blob restriction)
      return new SyncWorkerAdapter<TInput, TOutput>(handler);
    }
  }

  return new SyncWorkerAdapter<TInput, TOutput>(handler);
}
