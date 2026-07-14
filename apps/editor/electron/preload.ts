import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openAsset: () => ipcRenderer.invoke('dialog:openAsset'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  findFileRecursively: (dirPath: string, fileName: string) => ipcRenderer.invoke('fs:findFileRecursively', dirPath, fileName),
  readFileBinary: (filePath: string) => ipcRenderer.invoke('fs:readFileBinary', filePath),
  watchFile: (filePath: string) => ipcRenderer.invoke('fs:watchFile', filePath),
  unwatchFile: (filePath: string) => ipcRenderer.invoke('fs:unwatchFile', filePath),
  resolveRelative: (baseDir: string, relPath: string) => ipcRenderer.invoke('fs:resolveRelative', baseDir, relPath),
  dirname: (filePath: string) => ipcRenderer.invoke('fs:dirname', filePath),
  relative: (from: string, to: string) => ipcRenderer.invoke('fs:relative', from, to),
  onFileChanged: (callback: (filePath: string) => void) => {
    ipcRenderer.on('fs:fileChanged', (_, filePath) => callback(filePath));
  },
  saveProject: (exportData: any) => ipcRenderer.invoke('dialog:saveProject', exportData),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content)
});
