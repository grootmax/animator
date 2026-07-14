import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
