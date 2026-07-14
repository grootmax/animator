import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openFileWithMetadata: () => ipcRenderer.invoke('dialog:openFileWithMetadata'),
  saveFileDirect: (filePath: string, content: string) => ipcRenderer.invoke('dialog:saveFileDirect', filePath, content),
  saveFileWithDialog: (content: string) => ipcRenderer.invoke('dialog:saveFileWithDialog', content),
  openBinaryFile: () => ipcRenderer.invoke('dialog:openBinaryFile'),
  saveBinaryFileDirect: (filePath: string, buffer: ArrayBuffer) => ipcRenderer.invoke('dialog:saveBinaryFileDirect', filePath, buffer),
  saveBinaryFileWithDialog: (buffer: ArrayBuffer) => ipcRenderer.invoke('dialog:saveBinaryFileWithDialog', buffer),
  getRecentFiles: () => ipcRenderer.invoke('registry:getRecentFiles'),
  addRecentFile: (filePath: string) => ipcRenderer.invoke('registry:addRecentFile', filePath)
});
