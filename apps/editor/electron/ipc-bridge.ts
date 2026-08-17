import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { Schema } from './validator';
import * as path from 'path';

export interface IpcRouteConfig<T> {
  channel: string;
  schema?: Schema<T>;
  handler: (event: IpcMainInvokeEvent, payload: T) => Promise<any>;
}

export class IpcBridge {
  static register<T>(config: IpcRouteConfig<T>) {
    ipcMain.handle(config.channel, async (event, payload) => {
      if (config.schema) {
        const result = config.schema.validate(payload);
        if (!result.success) {
          const errorMsg = `[SECURITY AUDIT] Blocked malformed IPC request on channel ${config.channel}: ${result.error}`;
          console.error(errorMsg);
          // Return a standardized error to the frontend
          return { error: 'Invalid payload', details: result.error };
        }
        return await config.handler(event, result.data);
      } else {
        // For channels without payload like openFile, ensure no payload is passed
        if (payload !== undefined && payload !== null) {
          console.error(`[SECURITY AUDIT] Blocked unexpected payload on channel ${config.channel}`);
          return { error: 'Unexpected payload' };
        }
        return await config.handler(event, payload);
      }
    });
  }

  static isExtensionAllowed(filePath: string, allowedExtensions: string[]): boolean {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    return allowedExtensions.includes(ext);
  }
}
