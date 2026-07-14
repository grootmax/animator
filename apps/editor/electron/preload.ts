import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  
  saveBundle: (manifest: any, assets: Array<{ name: string; data: Uint8Array, mimeType: string }>) => 
    ipcRenderer.invoke('bundle:save', manifest, assets),
    
  openBundle: () => 
    ipcRenderer.invoke('bundle:open'),
    
  importAsset: () => 
    ipcRenderer.invoke('asset:import')
});
