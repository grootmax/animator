import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  openWorkspace: () => ipcRenderer.invoke('workspace:open'),
  getLastActiveWorkspace: () => ipcRenderer.invoke('workspace:getLastActive'),
  saveWorkspaceScene: (sceneData: any) => ipcRenderer.invoke('workspace:saveScene', sceneData),
  onWorkspaceUpdated: (callback: (manifest: any) => void) => {
    ipcRenderer.on('workspace-updated', (_, manifest) => callback(manifest));
  },
  readFileBinary: (filePath: string) => ipcRenderer.invoke('fs:readFileBinary', filePath)
});
