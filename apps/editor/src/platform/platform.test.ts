import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ElectronPlatformAdapter,
  SyncWorkerAdapter,
  WebPlatformAdapter,
  createWorkerAdapter,
  getPlatformAdapter,
  setPlatformAdapter,
} from "./index.js";
import type { ElectronAPI } from "./types.js";

function getTestWindow(): Window & { electronAPI?: ElectronAPI | undefined } {
  if (typeof window === "undefined") {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
  }
  return window as Window & { electronAPI?: ElectronAPI | undefined };
}

describe("Platform Abstraction Adapter", () => {
  beforeEach(() => {
    getTestWindow().electronAPI = undefined;
    setPlatformAdapter(null);
  });

  afterEach(() => {
    getTestWindow().electronAPI = undefined;
    setPlatformAdapter(null);
  });

  describe("WebPlatformAdapter", () => {
    test("returns web environment", () => {
      const adapter = new WebPlatformAdapter();
      expect(adapter.getEnvironment()).toBe("web");
    });

    test("performs saveFile and exportSvg without throwing missing IPC errors", async () => {
      const adapter = new WebPlatformAdapter();
      const saveResult = await adapter.saveFile(
        JSON.stringify({ test: true }),
        "test.json",
      );
      expect(saveResult).toBe(true);

      const exportResult = await adapter.exportSvg("<svg></svg>", "test.svg");
      expect(exportResult).toBe(true);
    });

    test("handles openFile without throwing Electron missing errors", async () => {
      const adapter = new WebPlatformAdapter();
      const result = await adapter.openFile();
      expect(result).toBeNull();
    });
  });

  describe("ElectronPlatformAdapter", () => {
    test("returns electron environment", () => {
      const adapter = new ElectronPlatformAdapter();
      expect(adapter.getEnvironment()).toBe("electron");
    });

    test("delegates to window.electronAPI when present", async () => {
      const mockOpenFile = vi.fn().mockResolvedValue('{"mock": true}');
      const mockSaveFile = vi.fn().mockResolvedValue(true);
      const mockExportSvg = vi.fn().mockResolvedValue(true);

      getTestWindow().electronAPI = {
        openFile: mockOpenFile,
        saveFile: mockSaveFile,
        exportSvg: mockExportSvg,
      };

      const adapter = new ElectronPlatformAdapter();

      const opened = await adapter.openFile();
      expect(mockOpenFile).toHaveBeenCalled();
      expect(opened).toBe('{"mock": true}');

      const saved = await adapter.saveFile('{"mock": true}');
      expect(mockSaveFile).toHaveBeenCalledWith('{"mock": true}');
      expect(saved).toBe(true);

      const exported = await adapter.exportSvg("<svg></svg>");
      expect(mockExportSvg).toHaveBeenCalledWith("<svg></svg>");
      expect(exported).toBe(true);
    });

    test("falls back to WebPlatformAdapter when window.electronAPI is missing", async () => {
      getTestWindow().electronAPI = undefined;
      const adapter = new ElectronPlatformAdapter();

      const saveResult = await adapter.saveFile('{"fallback": true}');
      expect(saveResult).toBe(true);
    });
  });

  describe("WorkerAdapter & Fallback Isolation", () => {
    test("SyncWorkerAdapter processes message in-memory without Web Worker", async () => {
      const handler = (msg: { count: number }) => ({ count: msg.count + 1 });
      const worker = new SyncWorkerAdapter(handler);

      expect(worker.isSynchronous()).toBe(true);

      const received: Array<{ count: number }> = [];
      worker.onMessage((data) => {
        received.push(data);
      });

      worker.postMessage({ count: 5 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ count: 6 });
    });

    test("createWorkerAdapter defaults to SyncWorkerAdapter in fallback/sync mode", () => {
      const handler = (str: string) => str.toUpperCase();
      const adapter = createWorkerAdapter(handler, undefined, true);

      expect(adapter.isSynchronous()).toBe(true);
    });
  });

  describe("Auto-detection and getPlatformAdapter", () => {
    test("returns WebPlatformAdapter when electronAPI is undefined", () => {
      getTestWindow().electronAPI = undefined;
      const adapter = getPlatformAdapter();
      expect(adapter.getEnvironment()).toBe("web");
      expect(adapter).toBeInstanceOf(WebPlatformAdapter);
    });

    test("returns ElectronPlatformAdapter when electronAPI is present", () => {
      getTestWindow().electronAPI = { openFile: vi.fn() };
      setPlatformAdapter(null);
      const adapter = getPlatformAdapter();
      expect(adapter.getEnvironment()).toBe("electron");
      expect(adapter).toBeInstanceOf(ElectronPlatformAdapter);
    });
  });
});
