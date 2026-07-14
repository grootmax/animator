import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: any) => ipcRenderer.invoke('dialog:saveFile', content),
  openProject: () => ipcRenderer.invoke('project:open'),
  importAsset: () => ipcRenderer.invoke('project:importAsset')
});
