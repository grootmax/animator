import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { App } from "./App.js";
import {
  ElectronPlatformAdapter,
  WebPlatformAdapter,
} from "./platform/index.js";
import type { ElectronAPI } from "./platform/types.js";

function getTestWindow(): Window & { electronAPI?: ElectronAPI | undefined } {
  if (typeof window === "undefined") {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
  }
  return window as Window & { electronAPI?: ElectronAPI | undefined };
}

describe("App Component and Platform Isolation", () => {
  test("App function component exists", () => {
    expect(App).toBeDefined();
  });

  test("App renders in web environment without throwing missing electronAPI errors", () => {
    getTestWindow().electronAPI = undefined;
    const adapter = new WebPlatformAdapter();
    expect(adapter.getEnvironment()).toBe("web");
    const html = renderToString(React.createElement(App, { adapter }));
    expect(html).toContain("Animator Editor");
    expect(html).toContain("Environment Mode:");
    expect(html).toContain("web");
  });

  test("App renders in electron environment with ElectronPlatformAdapter", async () => {
    const mockOpenFile = vi.fn().mockResolvedValue('{"test": 1}');
    const mockSaveFile = vi.fn().mockResolvedValue(true);
    const mockExportSvg = vi.fn().mockResolvedValue(true);

    getTestWindow().electronAPI = {
      openFile: mockOpenFile,
      saveFile: mockSaveFile,
      exportSvg: mockExportSvg,
    };

    const adapter = new ElectronPlatformAdapter();
    expect(adapter.getEnvironment()).toBe("electron");

    const html = renderToString(React.createElement(App, { adapter }));
    expect(html).toContain("Animator Editor");
    expect(html).toContain("electron");

    const content = await adapter.openFile();
    expect(mockOpenFile).toHaveBeenCalled();
    expect(content).toBe('{"test": 1}');

    getTestWindow().electronAPI = undefined;
  });
});
