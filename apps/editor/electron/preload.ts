import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  readBinary: (filePath: string) => ipcRenderer.invoke('file:readBinary', filePath),
  writeBinary: (filePath: string, data: Uint8Array) => ipcRenderer.invoke('file:writeBinary', filePath, data),
  getInitialState: () => ipcRenderer.invoke('project:getInitialState'),
  saveProject: (projectPath: string | null, content: string) => ipcRenderer.invoke('project:save', projectPath, content)
});
