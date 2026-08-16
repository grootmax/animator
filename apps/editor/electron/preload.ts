import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openProject: () => ipcRenderer.invoke('project:open'),
  createProject: () => ipcRenderer.invoke('project:create'),
  saveProject: (manifest: string) => ipcRenderer.invoke('project:save', manifest),
  saveAssetStream: (filename: string, port: MessagePort) => {
    ipcRenderer.postMessage('project:saveAsset', { filename }, [port]);
  }
});
