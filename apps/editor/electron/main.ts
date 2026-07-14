import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let activeFilePath: string | null = null;

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
ipcMain.handle('dialog:openFile', async (_, options?: { binary?: boolean }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'All Supported Files', extensions: ['svg', 'json', 'png', 'jpg', 'jpeg'] },
      { name: 'SVG files', extensions: ['svg'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  activeFilePath = filePaths[0];
  if (options?.binary) {
    return fs.promises.readFile(filePaths[0]);
  }
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string | Uint8Array, options?: { forceDialog?: boolean }) => {
  let targetPath = activeFilePath;

  if (!targetPath || options?.forceDialog) {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [
        { name: 'JSON files', extensions: ['json'] },
        { name: 'SVG files', extensions: ['svg'] }
      ]
    });
    if (canceled || !filePath) return false;
    targetPath = filePath;
    activeFilePath = filePath;
  }

  if (typeof content === 'string') {
    await fs.promises.writeFile(targetPath, content, 'utf-8');
  } else {
    await fs.promises.writeFile(targetPath, content);
  }
  return true;
});
