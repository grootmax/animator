import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options?: { binary?: boolean }) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (content: string | Uint8Array, options?: { forceDialog?: boolean }) => ipcRenderer.invoke('dialog:saveFile', content, options)
});
