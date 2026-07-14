import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('project:save', content),
  openProject: () => ipcRenderer.invoke('project:open'),
  importAsset: () => ipcRenderer.invoke('project:importAsset')
});
