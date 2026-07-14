import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options?: { binary?: boolean }) =>
    options ? ipcRenderer.invoke('dialog:openFile', options) : ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string | Uint8Array, options?: { forceDialog?: boolean }) =>
    options ? ipcRenderer.invoke('dialog:saveFile', content, options) : ipcRenderer.invoke('dialog:saveFile', content)
});
