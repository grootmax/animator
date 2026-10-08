/**
 * Types and interfaces for Platform Abstraction Adapter & Fallback Isolation.
 */

export interface ElectronAPI {
  openFile?: () => Promise<string | null>;
  saveFile?: (content: string) => Promise<boolean>;
  exportSvg?: (svgContent: string) => Promise<boolean>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI | undefined;
  }
}

export interface WorkerAdapter<TInput = unknown, TOutput = unknown> {
  postMessage(message: TInput): void;
  onMessage(handler: (data: TOutput) => void): void;
  terminate(): void;
  isSynchronous(): boolean;
}

export type WorkerTaskHandler<TInput, TOutput> = (
  input: TInput,
) => TOutput | Promise<TOutput>;

export interface PlatformAdapter {
  getEnvironment(): "web" | "electron";
  openFile(): Promise<string | null>;
  saveFile(content: string, filename?: string): Promise<boolean>;
  exportSvg(svgContent: string, filename?: string): Promise<boolean>;
  createWorker<TInput, TOutput>(
    handler: WorkerTaskHandler<TInput, TOutput>,
    scriptUrl?: string,
  ): WorkerAdapter<TInput, TOutput>;
}
