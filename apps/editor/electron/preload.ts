import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  saveProject: (content: string) => ipcRenderer.invoke('dialog:saveProject', content),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  getProjectPath: () => ipcRenderer.invoke('core:getProjectPath'),
});
