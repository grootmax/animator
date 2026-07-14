import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  saveStreamStart: () => ipcRenderer.invoke('saveStream:start'),
  saveStreamChunk: (id: string, chunk: string) => ipcRenderer.invoke('saveStream:chunk', id, chunk),
  saveStreamEnd: (id: string) => ipcRenderer.invoke('saveStream:end', id)
});
