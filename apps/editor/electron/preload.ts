import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openImage: () => ipcRenderer.invoke('dialog:openImage'),
  saveProjectBundle: (content: string, assets: any[]) => ipcRenderer.invoke('dialog:saveProjectBundle', content, assets),
  openProjectBundle: () => ipcRenderer.invoke('dialog:openProjectBundle')
});
