import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let currentSavePath: string | null = null;

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

ipcMain.handle('dialog:saveProjectBegin', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Binary Project', extensions: ['bin'] }]
  });
  if (canceled || !filePath) return null;
  currentSavePath = filePath;
  // Write magic bytes
  await fs.promises.writeFile(filePath, Buffer.from("BINPROJ1", "utf-8"));
  return filePath;
});

ipcMain.handle('dialog:saveProjectAppend', async (_, chunk: Uint8Array) => {
  if (!currentSavePath) return false;
  await fs.promises.appendFile(currentSavePath, Buffer.from(chunk));
  return true;
});

ipcMain.handle('dialog:openProject', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Binary Project', extensions: ['bin'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  currentSavePath = filePaths[0];
  const buffer = await fs.promises.readFile(currentSavePath);
  return buffer;
});
