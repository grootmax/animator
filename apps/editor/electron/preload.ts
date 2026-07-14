import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options?: { filePath?: string; useBinary?: boolean; returnDetails?: boolean }) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (content: string | Uint8Array, options?: { filePath?: string; showDialog?: boolean }) => ipcRenderer.invoke('dialog:saveFile', content, options),
  getLastOpenedPath: () => ipcRenderer.invoke('app:getLastOpenedPath')
});
