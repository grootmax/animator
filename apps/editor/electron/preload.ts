import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  saveFileStart: () => ipcRenderer.invoke('saveFileStart'),
  saveFileChunk: (chunk: string) => ipcRenderer.invoke('saveFileChunk', chunk),
  saveFileEnd: () => ipcRenderer.invoke('saveFileEnd'),
  saveFileCancel: () => ipcRenderer.invoke('saveFileCancel'),
  isSavingActive: () => ipcRenderer.invoke('isSavingActive'),
});
