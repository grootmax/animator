import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let lastOpenedFilePath: string | null = null;

const getConfigPath = () => path.join(app.getPath('userData'), 'editor-config.json');

const loadConfig = () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      if (config.lastOpenedFilePath) {
        lastOpenedFilePath = config.lastOpenedFilePath;
      }
    }
  } catch (e) {
    console.error('Failed to load config', e);
  }
};

const saveConfig = () => {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ lastOpenedFilePath }), 'utf-8');
  } catch (e) {
    console.error('Failed to save config', e);
  }
};

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
  loadConfig();
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
ipcMain.handle('app:getLastOpenedPath', () => {
  return lastOpenedFilePath;
});

ipcMain.handle('dialog:openFile', async (_, options?: { filePath?: string; useBinary?: boolean; returnDetails?: boolean }) => {
  let targetPath = options?.filePath;

  if (!targetPath) {
    const defaultPath = lastOpenedFilePath ? path.dirname(lastOpenedFilePath) : undefined;
    const { canceled, filePaths } = await dialog.showOpenDialog({
      defaultPath,
      properties: ['openFile'],
      filters: [
        { name: 'All Supported Files', extensions: ['svg', 'json'] },
        { name: 'SVG files', extensions: ['svg'] },
        { name: 'JSON files', extensions: ['json'] }
      ]
    });
    
    if (canceled || filePaths.length === 0) return null;
    targetPath = filePaths[0];
  }
  
  if (!targetPath) return null;
  
  try {
    const isBinary = options?.useBinary;
    const content = await fs.promises.readFile(targetPath, isBinary ? null : 'utf-8');

    lastOpenedFilePath = targetPath;
    saveConfig();

    if (options?.returnDetails) {
      return { content, filePath: targetPath };
    }
    return content;
  } catch (e) {
    console.error("Failed to read file", e);
    return null;
  }
});

ipcMain.handle('dialog:saveFile', async (_, content: string | Uint8Array, options?: { filePath?: string; showDialog?: boolean }) => {
  let targetPath = options?.filePath;

  if (options?.showDialog || !targetPath) {
    const defaultPath = lastOpenedFilePath ? (targetPath || path.dirname(lastOpenedFilePath)) : undefined;
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        { name: 'JSON files', extensions: ['json'] },
        { name: 'SVG files', extensions: ['svg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) return null;
    targetPath = filePath;
  }

  if (!targetPath) return null;

  if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
    await fs.promises.writeFile(targetPath, Buffer.from(content));
  } else {
    await fs.promises.writeFile(targetPath, content, 'utf-8');
  }

  lastOpenedFilePath = targetPath;
  saveConfig();

  return targetPath;
});
