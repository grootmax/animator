import { contextBridge, ipcRenderer } from 'electron';
import * as path from 'path';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  projectOpen: () => ipcRenderer.invoke('project:open'),
  projectSave: (content: Uint8Array, filePath?: string) => ipcRenderer.invoke('project:save', content, filePath),
  readBinary: (filePath: string) => ipcRenderer.invoke('asset:readBinary', filePath),
  writeBinary: (filePath: string, data: Uint8Array) => ipcRenderer.invoke('asset:writeBinary', filePath, data),
  authorizeDir: (dir: string) => ipcRenderer.invoke('asset:authorizeDir', dir),
  pathRelative: (from: string, to: string) => path.relative(from, to),
  pathResolve: (base: string, rel: string) => path.resolve(base, rel),
  pathDirname: (p: string) => path.dirname(p)
});
