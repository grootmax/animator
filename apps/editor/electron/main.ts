import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { setupSecurity } from './security';

let mainWindow: BrowserWindow | null = null;
let activeProjectDir: string | null = null;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function saveConfig(config: any) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
  return {};
}

function updateActiveProjectPath(filePath: string) {
  const config = loadConfig();
  config.lastProjectPath = filePath;
  activeProjectDir = path.dirname(filePath);
  saveConfig(config);
}

function isPathSafe(targetPath: string): boolean {
  const resolvedPath = path.normalize(targetPath);
  // Basic security to avoid access to system roots
  if (resolvedPath === '/' || resolvedPath === 'C:\\') return false;
  
  if (activeProjectDir && !resolvedPath.startsWith(activeProjectDir)) {
    // Allow if path is safe
  }
  return true;
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

  protocol.handle('asset', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname);
      
      const resolvedPath = path.resolve(filePath);
      if (!isPathSafe(resolvedPath)) {
        return new Response('Access Denied', { status: 403 });
      }

      return net.fetch(pathToFileURL(resolvedPath).toString());
    } catch (err) {
      return new Response('Not Found', { status: 404 });
    }
  });
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

// Session Recovery
ipcMain.handle('project:recoverSession', async () => {
  const config = loadConfig();
  const lastPath = config.lastProjectPath;
  if (lastPath && fs.existsSync(lastPath)) {
    try {
      activeProjectDir = path.dirname(lastPath);
      const content = await fs.promises.readFile(lastPath, 'utf-8');
      return { filePath: lastPath, content };
    } catch (err) {
      console.error('Failed to recover session file', err);
      return null;
    }
  }
  return null;
});

// Legacy IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Supported Files', extensions: ['json', 'svg'] },
      { name: 'JSON files', extensions: ['json'] },
      { name: 'SVG files', extensions: ['svg'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  updateActiveProjectPath(filePath);
  return { filePath, content };
});

ipcMain.handle('dialog:saveFile', async (_, content: string, knownPath?: string) => {
  let filePath = knownPath;

  if (!filePath) {
    const { canceled, filePath: dialogPath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    if (canceled || !dialogPath) return { success: false };
    filePath = dialogPath;
  }

  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    updateActiveProjectPath(filePath);
    return { success: true, filePath };
  } catch (err) {
    console.error('Failed to save file', err);
    return { success: false };
  }
});

// Binary IPC Handlers
ipcMain.handle('file:readBinary', async (_, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return buffer;
  } catch (err) {
    console.error('Failed to read binary file', err);
    return null;
  }
});

ipcMain.handle('file:writeBinary', async (_, filePath: string, data: Uint8Array) => {
  try {
    await fs.promises.writeFile(filePath, data);
    return true;
  } catch (err) {
    console.error('Failed to write binary file', err);
    return false;
  }
});
