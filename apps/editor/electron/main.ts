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

ipcMain.handle('dialog:saveProject', async (_, data: any) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    
    if (canceled || !filePath) {
      return { success: true };
    }

    if (data && data.scene && typeof data.scene === 'object') {
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(data.scene)) {
        if (node && typeof node === 'object') {
          const cleanNode = { ...node } as any;
          delete cleanNode.localMatrix;
          delete cleanNode.worldMatrix;
          delete cleanNode.isDirty;
          cleanScene[id] = cleanNode;
        } else {
          cleanScene[id] = node;
        }
      }
      data.scene = cleanScene;
    }

    const jsonString = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(filePath, jsonString, 'utf-8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
});
