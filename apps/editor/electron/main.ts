import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

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
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Security Hardening: Navigation guards
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isDev = !!process.env.VITE_DEV_SERVER_URL;
    let isAllowed = false;

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL);
      if (parsedUrl.origin === devServerUrl.origin) {
        isAllowed = true;
      }
    }
    
    if (parsedUrl.protocol === 'file:') {
      isAllowed = true;
    }

    if (!isAllowed) {
      console.warn(`Blocked unauthorized navigation to: ${navigationUrl}`);
      event.preventDefault();
    }
  });

  // Security Hardening: Window open handlers
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`Blocked unauthorized window open request for: ${url}`);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
        if (parsedUrl.origin !== devUrl.origin) {
          event.preventDefault();
        }
      } else {
        if (parsedUrl.protocol !== 'file:' || !parsedUrl.pathname.includes('/dist/index.html')) {
          event.preventDefault();
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  setupSecurity();
  loadConfig();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      const isLocalUrl = 
        parsedUrl.protocol === 'file:' || 
        (process.env.VITE_DEV_SERVER_URL && parsedUrl.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin);
      
      if (!isLocalUrl) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
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
