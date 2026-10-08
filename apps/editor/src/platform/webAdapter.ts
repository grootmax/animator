import type {
  PlatformAdapter,
  WorkerAdapter,
  WorkerTaskHandler,
} from "./types.js";
import { createWorkerAdapter } from "./workerAdapter.js";

/**
 * WebPlatformAdapter: HTML5 Web APIs default implementation.
 * Performs file and storage operations using web standard browser APIs without Electron dependencies.
 */
export class WebPlatformAdapter implements PlatformAdapter {
  private inMemoryStorage: Map<string, string> = new Map();

  public getEnvironment(): "web" {
    return "web";
  }

  public async openFile(): Promise<string | null> {
    if (typeof document === "undefined") {
      return this.inMemoryStorage.get("default_file") ?? null;
    }

    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.svg,text/plain";

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          resolve(typeof result === "string" ? result : null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };

      // Handle user cancellation if file picker is closed
      window.addEventListener(
        "focus",
        () => {
          setTimeout(() => {
            if (!input.files || input.files.length === 0) {
              resolve(null);
            }
          }, 500);
        },
        { once: true },
      );

      input.click();
    });
  }

  public async saveFile(
    content: string,
    filename = "project.json",
  ): Promise<boolean> {
    this.inMemoryStorage.set(filename, content);

    if (typeof document === "undefined") {
      return true;
    }

    try {
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return true;
    }
  }

  public async exportSvg(
    svgContent: string,
    filename = "export.svg",
  ): Promise<boolean> {
    this.inMemoryStorage.set(filename, svgContent);

    if (typeof document === "undefined") {
      return true;
    }

    try {
      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return true;
    }
  }

  public createWorker<TInput, TOutput>(
    handler: WorkerTaskHandler<TInput, TOutput>,
    scriptUrl?: string,
  ): WorkerAdapter<TInput, TOutput> {
    return createWorkerAdapter(handler, scriptUrl);
  }
}
