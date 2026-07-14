import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  getLastOpenedProject: () => ipcRenderer.invoke('project:getLastOpened'),
  saveSceneData: (buffer: SharedArrayBuffer) => ipcRenderer.invoke('dialog:saveSceneData', buffer)
});
