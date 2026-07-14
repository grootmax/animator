import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string | Uint8Array, filePath?: string) => ipcRenderer.invoke('dialog:saveFile', content, filePath),
  openAsset: () => ipcRenderer.invoke('dialog:openAsset')
});
