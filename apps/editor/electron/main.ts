import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
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
  protocol.handle('asset', (request) => {
    let fileUrl = request.url.replace('asset://', 'file://');
    fileUrl = decodeURIComponent(fileUrl);
    return net.fetch(fileUrl, { bypassCustomProtocolHandlers: true });
  });

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

ipcMain.handle('dialog:openProject', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  const content = await fs.promises.readFile(filePaths[0], 'utf-8');
  return { path: filePaths[0], content };
});

ipcMain.handle('dialog:saveProject', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return filePath;
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('path:relative', (_, fromPath: string, toPath: string) => path.relative(fromPath, toPath));
ipcMain.handle('path:resolve', (_, ...paths: string[]) => path.resolve(...paths));
ipcMain.handle('path:dirname', (_, p: string) => path.dirname(p));
ipcMain.handle('path:isAbsolute', (_, p: string) => path.isAbsolute(p));
