import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: any) => ipcRenderer.invoke('file:save', content),
  saveFileAs: (content: any) => ipcRenderer.invoke('file:saveAs', content),
  getInitialFile: () => ipcRenderer.invoke('file:getInitial')
});
