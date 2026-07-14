import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openImageFile: () => ipcRenderer.invoke('dialog:openImageFile'),
  saveFile: (content: any) => ipcRenderer.invoke('dialog:saveFile', content)
});
