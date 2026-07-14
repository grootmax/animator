import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

const ALLOWED_DOMAINS = [
  'react.dev',
  'pixijs.com',
  'tailwindcss.com',
  'electronjs.org'
];

function handleNavigation(url: string): { action: 'allow' | 'open-external' | 'block' } {
  try {
    const parsedUrl = new URL(url);

    // 1. Allow local dev server
    if (process.env.VITE_DEV_SERVER_URL) {
      const devOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin;
      if (parsedUrl.origin === devOrigin) {
        return { action: 'allow' };
      }
    }

    // 2. Allow standard local bundle load
    if (parsedUrl.protocol === 'file:') {
      return { action: 'allow' };
    }

    // 3. Check allowed external documentation domains
    const hostname = parsedUrl.hostname;
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

    if (isAllowed) {
      return { action: 'open-external' };
    }

    return { action: 'block' };
  } catch {
    return { action: 'block' };
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const { action } = handleNavigation(url);
    if (action === 'allow') {
      return;
    }
    event.preventDefault();
    if (action === 'open-external') {
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const { action } = handleNavigation(url);
    if (action === 'allow') {
      return { action: 'allow' };
    }
    if (action === 'open-external') {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = !!process.env.VITE_DEV_SERVER_URL;
    let csp = "default-src 'self';";

    if (isDev) {
      const devUrl = process.env.VITE_DEV_SERVER_URL!;
      const devHost = new URL(devUrl).host;
      const wsUrl = `ws://${devHost} wss://${devHost}`;
      csp = `default-src 'self' ${devUrl}; ` +
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devUrl}; ` +
            `style-src 'self' 'unsafe-inline' ${devUrl}; ` +
            `img-src 'self' data: blob: ${devUrl}; ` +
            `connect-src 'self' ${devUrl} ${wsUrl};`;
    } else {
      csp = "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:;";
    }

    const responseHeaders = { ...details.responseHeaders };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }
    responseHeaders['Content-Security-Policy'] = [csp];

    callback({ responseHeaders });
  });

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
