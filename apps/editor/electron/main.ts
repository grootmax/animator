import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

const configPath = path.join(app.getPath('userData'), 'editor-config.json');

function getLastPath(): string | null {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.lastPath || null;
    }
  } catch (e) {
    console.error('Failed to read config', e);
  }
  return null;
}

function setLastPath(filePath: string | null) {
  try {
    const config = { lastPath: filePath };
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
  } catch (e) {
    console.error('Failed to write config', e);
  }
}

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
    filters: [{ name: 'Project Files', extensions: ['json', 'svg', 'bin'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  setLastPath(filePaths[0]);
  const content = await fs.promises.readFile(filePaths[0]);
  return { path: filePaths[0], content };
});

ipcMain.handle('file:getInitial', async () => {
  const lastPath = getLastPath();
  if (lastPath && fs.existsSync(lastPath)) {
    const content = await fs.promises.readFile(lastPath); // Read as Buffer
    return { path: lastPath, content };
  }
  return null;
});

ipcMain.handle('file:save', async (_, content: Buffer | Uint8Array | string) => {
  const lastPath = getLastPath();
  if (lastPath) {
    await fs.promises.writeFile(lastPath, content);
    return lastPath;
  }
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Project Files', extensions: ['bin', 'json'] }]
  });
  if (canceled || !filePath) return false;
  setLastPath(filePath);
  await fs.promises.writeFile(filePath, content);
  return filePath;
});

ipcMain.handle('file:saveAs', async (_, content: Buffer | Uint8Array | string) => {
  const lastPath = getLastPath();
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: lastPath || undefined,
    filters: [{ name: 'Project Files', extensions: ['bin', 'json'] }]
  });
  if (canceled || !filePath) return false;
  setLastPath(filePath);
  await fs.promises.writeFile(filePath, content);
  return filePath;
});
