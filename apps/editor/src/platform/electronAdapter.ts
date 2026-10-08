import type {
  ElectronAPI,
  PlatformAdapter,
  WorkerAdapter,
  WorkerTaskHandler,
} from "./types.js";
import { WebPlatformAdapter } from "./webAdapter.js";
import { createWorkerAdapter } from "./workerAdapter.js";

function getElectronAPI(): ElectronAPI | undefined {
  if (typeof window !== "undefined") {
    return window.electronAPI;
  }
  const globalWin = (globalThis as { window?: { electronAPI?: ElectronAPI } })
    .window;
  return globalWin?.electronAPI;
}

/**
 * ElectronPlatformAdapter: Desktop Electron IPC implementation.
 * Delegates file operations to window.electronAPI when present in Electron desktop mode,
 * falling back to WebPlatformAdapter safely if any IPC method is absent.
 */
export class ElectronPlatformAdapter implements PlatformAdapter {
  private fallbackAdapter = new WebPlatformAdapter();

  public getEnvironment(): "electron" {
    return "electron";
  }

  public async openFile(): Promise<string | null> {
    const electronAPI = getElectronAPI();

    if (electronAPI?.openFile && typeof electronAPI.openFile === "function") {
      try {
        return await electronAPI.openFile();
      } catch (err) {
        console.warn("Electron openFile IPC failed, using web fallback:", err);
        return this.fallbackAdapter.openFile();
      }
    }

    return this.fallbackAdapter.openFile();
  }

  public async saveFile(
    content: string,
    filename = "project.json",
  ): Promise<boolean> {
    const electronAPI = getElectronAPI();

    if (electronAPI?.saveFile && typeof electronAPI.saveFile === "function") {
      try {
        return await electronAPI.saveFile(content);
      } catch (err) {
        console.warn("Electron saveFile IPC failed, using web fallback:", err);
        return this.fallbackAdapter.saveFile(content, filename);
      }
    }

    return this.fallbackAdapter.saveFile(content, filename);
  }

  public async exportSvg(
    svgContent: string,
    filename = "export.svg",
  ): Promise<boolean> {
    const electronAPI = getElectronAPI();

    if (electronAPI?.exportSvg && typeof electronAPI.exportSvg === "function") {
      try {
        return await electronAPI.exportSvg(svgContent);
      } catch (err) {
        console.warn("Electron exportSvg IPC failed, using web fallback:", err);
        return this.fallbackAdapter.exportSvg(svgContent, filename);
      }
    }

    return this.fallbackAdapter.exportSvg(svgContent, filename);
  }

  public createWorker<TInput, TOutput>(
    handler: WorkerTaskHandler<TInput, TOutput>,
    scriptUrl?: string,
  ): WorkerAdapter<TInput, TOutput> {
    return createWorkerAdapter(handler, scriptUrl);
  }
}
