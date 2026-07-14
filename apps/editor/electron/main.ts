import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let currentProjectRoot: string | null = null;

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

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  const dirPath = filePaths[0];
  const manifestPath = path.join(dirPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    currentProjectRoot = dirPath;
    const manifest = await fs.promises.readFile(manifestPath, 'utf-8');
    return { type: 'project', manifest, root: dirPath };
  } else {
    return { type: 'error', message: 'Not a valid project folder (missing manifest.json)' };
  }
});

ipcMain.handle('project:create', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  const dirPath = filePaths[0];
  currentProjectRoot = dirPath;
  const assetsDir = path.join(dirPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    await fs.promises.mkdir(assetsDir, { recursive: true });
  }
  const manifest = JSON.stringify({ version: "1.0.0", assets: [], scene: {} });
  await fs.promises.writeFile(path.join(dirPath, 'manifest.json'), manifest, 'utf-8');
  return { type: 'project', manifest, root: dirPath };
});

ipcMain.handle('project:save', async (_, manifest: string) => {
  if (!currentProjectRoot) return false;
  const manifestPath = path.join(currentProjectRoot, 'manifest.json');
  const tempPath = manifestPath + '.tmp';
  // Atomic save
  await fs.promises.writeFile(tempPath, manifest, 'utf-8');
  await fs.promises.rename(tempPath, manifestPath);
  return true;
});

ipcMain.on('project:saveAsset', (event, data) => {
  const { filename } = data;
  const port = event.ports[0];
  if (!currentProjectRoot || !port) {
    if (port) port.close();
    return;
  }

  const destPath = path.join(currentProjectRoot, 'assets', filename);
  const writeStream = fs.createWriteStream(destPath);

  port.on('message', (msgEvent) => {
    if (msgEvent.data === 'EOF') {
      writeStream.end();
      port.close();
    } else {
      writeStream.write(Buffer.from(msgEvent.data));
    }
  });
  
  writeStream.on('error', () => {
    port.close();
  });
  
  port.start();
});
