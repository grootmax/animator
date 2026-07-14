import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: any) => ipcRenderer.invoke('dialog:saveFile', content),
  saveAs: (content: any) => ipcRenderer.invoke('dialog:saveAs', content),
  getRecentProject: () => ipcRenderer.invoke('project:getRecent'),
  addAsset: () => ipcRenderer.invoke('dialog:addAsset')
});
