import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  projectSaveStart: () => ipcRenderer.invoke('project:saveStart'),
  projectSaveChunk: (filePath: string, chunk: Uint8Array) => ipcRenderer.invoke('project:saveChunk', filePath, chunk),
  projectLoadStart: () => ipcRenderer.invoke('project:loadStart'),
  projectLoadChunk: (filePath: string, start: number, length: number) => ipcRenderer.invoke('project:loadChunk', filePath, start, length),
  readTextFile: (filePath: string) => ipcRenderer.invoke('file:readText', filePath)
});
