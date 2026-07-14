import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  loadRecentProject: () => ipcRenderer.invoke('project:loadRecent'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (content: string) => ipcRenderer.invoke('project:save', content),
  saveProjectAs: (content: string) => ipcRenderer.invoke('project:saveAs', content),
  readAssetBuffer: (assetPath: string) => ipcRenderer.invoke('project:readAssetBuffer', assetPath)
});
