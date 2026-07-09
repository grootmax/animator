import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: () => ipcRenderer.invoke('dialog:showOpenDialog'),
  showSaveDialog: (defaultPath?: string) => ipcRenderer.invoke('dialog:showSaveDialog', defaultPath),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('file:write', { filePath, content }),
  getRecentFiles: () => ipcRenderer.invoke('getRecentFiles'),
  setDirty: (isDirty: boolean) => ipcRenderer.send('set-dirty', isDirty),
  
  onMenuOpen: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-open', handler);
    return () => ipcRenderer.off('menu-open', handler);
  },
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-save', handler);
    return () => ipcRenderer.off('menu-save', handler);
  },
  onMenuSaveAs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-save-as', handler);
    return () => ipcRenderer.off('menu-save-as', handler);
  },
  onOpenRecentFile: (callback: (filePath: string) => void) => {
    const handler = (_: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-recent-file', handler);
    return () => ipcRenderer.off('open-recent-file', handler);
  },
  onRequestSaveAndClose: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('request-save-and-close', handler);
    return () => ipcRenderer.off('request-save-and-close', handler);
  },
  closeApp: () => ipcRenderer.send('force-close'),
  
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
});
