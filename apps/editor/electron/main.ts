import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

let mainWindow: BrowserWindow | null = null;

const DOMAIN_WHITELIST = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

function setupSecurity() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const devUrl = isDev ? new URL(process.env.VITE_DEV_SERVER_URL!).origin : '';

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspRules = [
      `default-src 'self' ${isDev ? devUrl : ''}`,
      `script-src 'self' ${isDev ? "'unsafe-inline' 'unsafe-eval' " + devUrl : ''}`,
      `style-src 'self' 'unsafe-inline' ${DOMAIN_WHITELIST.join(' ')}`,
      `font-src 'self' data: ${DOMAIN_WHITELIST.join(' ')}`,
      `img-src 'self' data: blob: ${DOMAIN_WHITELIST.join(' ')} ${isDev ? devUrl : ''}`,
      `connect-src 'self' ${isDev ? devUrl + " ws: wss:" : ''} ${DOMAIN_WHITELIST.join(' ')}`
    ];

    const csp = cspRules.map(rule => rule.trim()).filter(Boolean).join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      try {
        const parsedUrl = new URL(navigationUrl);
        const isAppUrl = isDev 
          ? parsedUrl.origin === devUrl 
          : parsedUrl.protocol === 'file:';
          
        if (!isAppUrl) {
          event.preventDefault();
          shell.openExternal(navigationUrl);
        }
      } catch (err) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsedUrl = new URL(url);
        const isAppUrl = isDev 
          ? parsedUrl.origin === devUrl 
          : parsedUrl.protocol === 'file:';
          
        if (!isAppUrl) {
          shell.openExternal(url);
          return { action: 'deny' };
        }
        return { action: 'allow' };
      } catch (err) {
        return { action: 'deny' };
      }
    });
  });
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
let currentProjectPath: string | null = null;

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  try {
    JSON.parse(content);
  } catch (error) {
    return false;
  }

  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return false;

    if (path.extname(filePath).toLowerCase() !== '.json') {
      return false;
    }

    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Project Files', extensions: ['json'] }]
  });
  if (canceled || filePaths.length === 0) return { success: false };
  
  try {
    const content = await fs.promises.readFile(filePaths[0], 'utf-8');
    const data = JSON.parse(content);
    currentProjectPath = filePaths[0];
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('project:save', async (_, payloadStr: string, isSaveAs: boolean = false) => {
  try {
    const payload = JSON.parse(payloadStr);
    let targetPath = currentProjectPath;

    if (isSaveAs || !targetPath) {
      const { canceled, filePath } = await dialog.showSaveDialog({
        filters: [{ name: 'Project Files', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { success: false };
      targetPath = filePath;
    }

    if (payload.type === 'delta') {
      if (!currentProjectPath || currentProjectPath !== targetPath) {
        // Must fallback to full save if trying to save a delta to a different file
        return { success: false, error: 'fallback_to_full' };
      }
      
      const existingContent = await fs.promises.readFile(targetPath, 'utf-8');
      const existingData = JSON.parse(existingContent);
      
      if (payload.deleted) {
        for (const id of payload.deleted) {
          delete existingData.scene[id];
        }
      }
      if (payload.addedOrModified) {
        for (const [id, node] of Object.entries(payload.addedOrModified)) {
          existingData.scene[id] = node;
        }
      }
      if (payload.animations) {
        existingData.animations = payload.animations;
      }
      if (payload.metadata) {
        existingData.metadata = payload.metadata;
      }
      
      const tempPath = targetPath + '.tmp';
      await fs.promises.writeFile(tempPath, JSON.stringify(existingData), 'utf-8');
      await fs.promises.rename(tempPath, targetPath);
      
      currentProjectPath = targetPath;
      return { success: true, savedPath: targetPath };
    } else {
      // Full save
      const tempPath = targetPath + '.tmp';
      await fs.promises.writeFile(tempPath, JSON.stringify(payload.data), 'utf-8');
      await fs.promises.rename(tempPath, targetPath);
      
      currentProjectPath = targetPath;
      return { success: true, savedPath: targetPath };
    }
  } catch (err: any) {
    console.error('Save failed', err);
    return { success: false, error: err.message };
  }
});
