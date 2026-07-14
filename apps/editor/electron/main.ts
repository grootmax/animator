import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

// Register custom protocol as privileged
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true, stream: true } }
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
  
  // Custom asset protocol handler
  protocol.handle('asset', (request) => {
    const urlPath = decodeURIComponent(request.url.replace('asset://', ''));
    // Basic security check: resolve path and check if it exists
    const safePath = path.resolve(urlPath);
    return net.fetch(`file://${safePath}`);
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

// Recent files registry
function getRecentFilesPath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

ipcMain.handle('registry:getRecentFiles', async () => {
  try {
    const data = await fs.promises.readFile(getRecentFilesPath(), 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('registry:addRecentFile', async (_, filePath: string) => {
  try {
    const recentPath = getRecentFilesPath();
    let recentFiles: string[] = [];
    try {
      const data = await fs.promises.readFile(recentPath, 'utf-8');
      recentFiles = JSON.parse(data);
    } catch (e) {
      // Ignore
    }
    recentFiles = recentFiles.filter(p => p !== filePath);
    recentFiles.unshift(filePath);
    if (recentFiles.length > 10) {
      recentFiles = recentFiles.slice(0, 10);
    }
    await fs.promises.writeFile(recentPath, JSON.stringify(recentFiles), 'utf-8');
    return recentFiles;
  } catch (e) {
    return [];
  }
});

function addRecent(filePath: string) {
  const recentPath = getRecentFilesPath();
  let recentFiles: string[] = [];
  try {
    const data = fs.readFileSync(recentPath, 'utf-8');
    recentFiles = JSON.parse(data);
  } catch (e) {}
  recentFiles = recentFiles.filter(p => p !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > 10) recentFiles = recentFiles.slice(0, 10);
  fs.writeFileSync(recentPath, JSON.stringify(recentFiles), 'utf-8');
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  addRecent(filePaths[0]);
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:openFileWithMetadata', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const content = await fs.promises.readFile(filePaths[0], 'utf-8');
  addRecent(filePaths[0]);
  return { content, filePath: filePaths[0] };
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return true;
});

ipcMain.handle('dialog:saveFileDirect', async (_, filePath: string, content: string) => {
  await fs.promises.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return true;
});

ipcMain.handle('dialog:saveFileWithDialog', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({});
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return filePath;
});

// Binary IPC handlers
ipcMain.handle('dialog:openBinaryFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return null;
  const buffer = await fs.promises.readFile(filePaths[0]);
  addRecent(filePaths[0]);
  return { buffer: buffer.buffer, filePath: filePaths[0] };
});

ipcMain.handle('dialog:saveBinaryFileDirect', async (_, filePath: string, buffer: ArrayBuffer) => {
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  addRecent(filePath);
  return true;
});


ipcMain.handle('dialog:saveBinaryFileWithDialog', async (_, buffer: ArrayBuffer) => {
  const { canceled, filePath } = await dialog.showSaveDialog({});
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  addRecent(filePath);
  return filePath;
});
