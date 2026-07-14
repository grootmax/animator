import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  startSave: () => ipcRenderer.invoke('startSave'),
  writeChunk: (saveId: string, chunk: string) => ipcRenderer.invoke('writeChunk', saveId, chunk),
  endSave: (saveId: string, success: boolean) => ipcRenderer.invoke('endSave', saveId, success)
});
