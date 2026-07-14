import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
let currentProjectPath: string | null = null;

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Project Files', extensions: ['json'] }]
  });
  if (canceled || filePaths.length === 0) return { success: false };
  
  try {
    const content = await fs.promises.readFile(filePaths[0], 'utf-8');
    const data = JSON.parse(content);
    currentProjectPath = filePaths[0];
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('project:save', async (_, payloadStr: string, isSaveAs: boolean = false) => {
  try {
    const payload = JSON.parse(payloadStr);
    let targetPath = currentProjectPath;

    if (isSaveAs || !targetPath) {
      const { canceled, filePath } = await dialog.showSaveDialog({
        filters: [{ name: 'Project Files', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { success: false };
      targetPath = filePath;
    }

    if (payload.type === 'delta') {
      if (!currentProjectPath || currentProjectPath !== targetPath) {
        // Must fallback to full save if trying to save a delta to a different file
        return { success: false, error: 'fallback_to_full' };
      }
      
      const existingContent = await fs.promises.readFile(targetPath, 'utf-8');
      const existingData = JSON.parse(existingContent);
      
      if (payload.deleted) {
        for (const id of payload.deleted) {
          delete existingData.scene[id];
        }
      }
      if (payload.addedOrModified) {
        for (const [id, node] of Object.entries(payload.addedOrModified)) {
          existingData.scene[id] = node;
        }
      }
      if (payload.animations) {
        existingData.animations = payload.animations;
      }
      if (payload.metadata) {
        existingData.metadata = payload.metadata;
      }
      
      const tempPath = targetPath + '.tmp';
      await fs.promises.writeFile(tempPath, JSON.stringify(existingData), 'utf-8');
      await fs.promises.rename(tempPath, targetPath);
      
      currentProjectPath = targetPath;
      return { success: true, savedPath: targetPath };
    } else {
      // Full save
      const tempPath = targetPath + '.tmp';
      await fs.promises.writeFile(tempPath, JSON.stringify(payload.data), 'utf-8');
      await fs.promises.rename(tempPath, targetPath);
      
      currentProjectPath = targetPath;
      return { success: true, savedPath: targetPath };
    }
  } catch (err: any) {
    console.error('Save failed', err);
    return { success: false, error: err.message };
  }
});
