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
    filters: [{ name: 'All Supported', extensions: ['svg', 'json', 'bspf'] }]
  });
  if (canceled) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [
      { name: 'Supported Files', extensions: ['json', 'svg'] }
    ]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('project:saveStart', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [
      { name: 'Binary Project Files', extensions: ['bspf'] },
      { name: 'JSON Project Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, new Uint8Array(0));
  return filePath;
});

ipcMain.handle('project:saveChunk', async (_, filePath: string, chunk: Uint8Array) => {
  await fs.promises.appendFile(filePath, chunk);
  return true;
});

ipcMain.handle('project:loadStart', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Project Files', extensions: ['bspf', 'json', 'svg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const stat = await fs.promises.stat(filePath);
  return { filePath, size: stat.size };
});

ipcMain.handle('file:readText', async (_, filePath: string) => {
  return fs.promises.readFile(filePath, 'utf-8');
});

ipcMain.handle('project:loadChunk', async (_, filePath: string, start: number, length: number) => {
  const handle = await fs.promises.open(filePath, 'r');
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, start);
  await handle.close();
  return buffer.subarray(0, bytesRead);
});
