import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  saveProjectBegin: () => ipcRenderer.invoke('dialog:saveProjectBegin'),
  saveProjectAppend: (chunk: Uint8Array) => ipcRenderer.invoke('dialog:saveProjectAppend', chunk),
  openProject: () => ipcRenderer.invoke('dialog:openProject')
});
