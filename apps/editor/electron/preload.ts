import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  pickMediaFile: () => ipcRenderer.invoke('dialog:pickMediaFile'),
  saveFile: (content: any) => ipcRenderer.invoke('dialog:saveFile', content)
});
