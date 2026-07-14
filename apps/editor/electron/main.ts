import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

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

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return false;

    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    return false;
  }
});
