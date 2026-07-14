import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string, knownPath?: string) => ipcRenderer.invoke('dialog:saveFile', content, knownPath),
  recoverSession: () => ipcRenderer.invoke('project:recoverSession'),
  readBinary: (filePath: string) => ipcRenderer.invoke('file:readBinary', filePath),
  writeBinary: (filePath: string, buffer: Uint8Array) => ipcRenderer.invoke('file:writeBinary', filePath, buffer)
});
