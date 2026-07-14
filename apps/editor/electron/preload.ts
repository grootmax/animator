import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  
  // Project Engine APIs
  projectCreate: () => ipcRenderer.invoke('project:create'),
  projectOpen: () => ipcRenderer.invoke('project:open'),
  projectSave: (manifest: any) => ipcRenderer.invoke('project:save', manifest),
  projectImportAsset: () => ipcRenderer.invoke('project:importAsset'),
  projectGetLastActive: () => ipcRenderer.invoke('project:getLastActive')
});
