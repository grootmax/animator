import { ElectronPlatformAdapter } from "./electronAdapter.js";
import type { PlatformAdapter } from "./types.js";
import { WebPlatformAdapter } from "./webAdapter.js";

export * from "./types.js";
export * from "./webAdapter.js";
export * from "./electronAdapter.js";
export * from "./workerAdapter.js";

let activeAdapterInstance: PlatformAdapter | null = null;

/**
 * Returns active platform adapter instance based on runtime environment detection.
 * In production web builds without window.electronAPI, WebPlatformAdapter is used.
 */
export function getPlatformAdapter(
  overrideAdapter?: PlatformAdapter,
): PlatformAdapter {
  if (overrideAdapter) {
    return overrideAdapter;
  }

  if (activeAdapterInstance) {
    return activeAdapterInstance;
  }

  const electronAPI =
    (typeof window !== "undefined" ? window.electronAPI : undefined) ??
    (globalThis as { window?: { electronAPI?: unknown } }).window?.electronAPI;

  const isElectronAvailable = electronAPI !== undefined;

  if (isElectronAvailable) {
    activeAdapterInstance = new ElectronPlatformAdapter();
  } else {
    activeAdapterInstance = new WebPlatformAdapter();
  }

  return activeAdapterInstance;
}

/**
 * Sets active platform adapter instance explicitly (e.g. for testing or config).
 */
export function setPlatformAdapter(adapter: PlatformAdapter | null): void {
  activeAdapterInstance = adapter;
}
