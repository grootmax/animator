import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  saveProject: (content: Uint8Array) => ipcRenderer.invoke('dialog:saveProject', content)
});
