import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (payload: string, isSaveAs?: boolean) => ipcRenderer.invoke('project:save', payload, isSaveAs)
});
