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
    filters: [{ name: 'Supported files', extensions: ['svg', 'json'] }]
  });
  if (canceled) return null;
  const content = await fs.promises.readFile(filePaths[0]);
  return { content, filePath: filePaths[0] };
});

ipcMain.handle('dialog:saveFile', async (_, content: string | Uint8Array, filePath?: string) => {
  let targetPath = filePath;
  if (!targetPath) {
    const { canceled, filePath: dialogPath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    if (canceled || !dialogPath) return null;
    targetPath = dialogPath;
  }
  await fs.promises.writeFile(targetPath, content);
  return targetPath;
});

ipcMain.handle('dialog:openAsset', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Assets', extensions: ['png', 'jpg', 'jpeg', 'svg'] }]
  });
  if (canceled) return null;
  const filePath = filePaths[0];
  const data = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  let mimeType = 'application/octet-stream';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.svg') mimeType = 'image/svg+xml';

  return { filePath, mimeType, data };
});
