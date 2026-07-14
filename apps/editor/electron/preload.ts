import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  saveProject: (content: string) => ipcRenderer.invoke('dialog:saveProject', content),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  path: {
    relative: (from: string, to: string) => ipcRenderer.invoke('path:relative', from, to),
    resolve: (...paths: string[]) => ipcRenderer.invoke('path:resolve', ...paths),
    dirname: (p: string) => ipcRenderer.invoke('path:dirname', p),
    isAbsolute: (p: string) => ipcRenderer.invoke('path:isAbsolute', p)
  }
});
