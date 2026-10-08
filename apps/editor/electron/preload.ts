import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (options: { format: string; data: any }) => ipcRenderer.invoke('dialog:saveFile', options)
});
