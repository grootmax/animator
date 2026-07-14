import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let activeProjectDir: string | null = null;
const authorizedDirs = new Set<string>();

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);


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

  protocol.handle('asset', async (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    if (!filePath) {
      return new Response('Bad Request: Missing path', { status: 400 });
    }
    
    // Security Check
    if (!activeProjectDir) {
      return new Response('Access Denied: No active project', { status: 403 });
    }
    
    const absolutePath = path.resolve(filePath);
    let isAuthorized = false;
    if (activeProjectDir && absolutePath.startsWith(activeProjectDir)) isAuthorized = true;
    for (const dir of authorizedDirs) {
      if (absolutePath.startsWith(dir)) {
        isAuthorized = true;
        break;
      }
    }

    if (!isAuthorized) {
      return new Response('Access Denied: Out of bounds', { status: 403 });
    }
    
    try {
      return await net.fetch('file://' + absolutePath);
    } catch (err) {
      return new Response('File Not Found', { status: 404 });
    }
  });

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

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Supported files', extensions: ['json', 'svg'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const buffer = await fs.promises.readFile(filePath);
  activeProjectDir = path.dirname(filePath);
  return { filePath, content: new Uint8Array(buffer) };
});

ipcMain.handle('project:save', async (_, content: Uint8Array, filePath?: string) => {
  let savePath = filePath;
  if (!savePath) {
    const { canceled, filePath: dialogPath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    if (canceled || !dialogPath) return { success: false };
    savePath = dialogPath;
  }
  await fs.promises.writeFile(savePath, Buffer.from(content));
  activeProjectDir = path.dirname(savePath);
  return { success: true, filePath: savePath };
});

ipcMain.handle('asset:authorizeDir', async (_, dir: string) => {
  authorizedDirs.add(dir);
  return true;
});

ipcMain.handle('asset:readBinary', async (_, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return new Uint8Array(buffer);
  } catch (err) {
    return null;
  }
});

ipcMain.handle('asset:writeBinary', async (_, filePath: string, data: Uint8Array) => {
  try {
    await fs.promises.writeFile(filePath, Buffer.from(data));
    return true;
  } catch (err) {
    return false;
  }
});
