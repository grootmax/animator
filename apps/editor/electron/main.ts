import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

const DOMAIN_WHITELIST = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

function isAllowedUrl(url: string): boolean {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    try {
      const devOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin;
      if (url.startsWith(devOrigin)) return true;
    } catch {}
  }
  if (url.startsWith('file:') || /^[a-zA-Z]:[\\/]/.test(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:' || /^[a-zA-Z]:$/.test(parsed.protocol)) {
      return true;
    }
  } catch {}
  return false;
}

function setupSecurity() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const devUrl = isDev ? new URL(process.env.VITE_DEV_SERVER_URL!).origin : '';

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspRules = [
      `default-src 'self' ${isDev ? devUrl : ''}`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${isDev ? devUrl : ''}`,
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

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      if (!isAllowedUrl(navigationUrl)) {
        event.preventDefault();
        try {
          shell.openExternal(navigationUrl);
        } catch {}
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedUrl(url)) {
        try {
          shell.openExternal(url);
        } catch {}
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
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
  setupSecurity();
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
ipcMain.handle('dialog:openProject', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Jules Project', extensions: ['jules', 'json'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  const buffer = await fs.promises.readFile(filePaths[0]);
  return new Uint8Array(buffer);
});

ipcMain.handle('dialog:saveProject', async (_, content: Uint8Array) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Jules Project', extensions: ['jules'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content);
  return true;
});

ipcMain.handle('dialog:openFile', async () => {
  if (process.env.TEST_MODE === 'true') {
    const testSvgPath = path.join(__dirname, '../test-resources/test.svg');
    return fs.promises.readFile(testSvgPath, 'utf-8');
  }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  if (process.env.TEST_MODE === 'true' && process.env.TEST_SAVE_PATH) {
    await fs.promises.writeFile(process.env.TEST_SAVE_PATH, content, 'utf-8');
    return true;
  }

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
