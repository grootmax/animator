import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const ALLOWED_ORIGINS = [
  'https://trusted-domain.com',
  'https://help.mycompany.com',
  'https://docs.mycompany.com'
];

let mainWindow: BrowserWindow | null = null;

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

  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  // Requirement 3: Restrict all renderer-initiated navigations to a predefined allowlist of trusted origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      
      // Allow navigation to local files in production
      if (!isDev && parsedUrl.protocol === 'file:') return;
      
      // Allow navigation to dev server in development
      if (isDev && devServerUrl && url.startsWith(devServerUrl)) return;

      // Always prevent default for non-local navigations to keep the user within the secure app environment
      event.preventDefault();

      // Check against allowlist
      const isAllowed = ALLOWED_ORIGINS.some(allowedUrl => url.startsWith(allowedUrl));
      if (isAllowed) {
        // Requirement 5: Safe external link handling
        shell.openExternal(url);
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  // Requirement 4 & 5: Prevent unauthorized secondary windows, open approved in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const isAllowed = ALLOWED_ORIGINS.some(allowedUrl => url.startsWith(allowedUrl));
      
      if (isAllowed) {
        // Requirement 5: Provide a secure mechanism to open approved external URLs in the system's default web browser
        shell.openExternal(url);
      }
    } catch (e) {
      console.error('Invalid URL', e);
    }
    // Always deny opening a new Electron window
    return { action: 'deny' };
  });

  if (isDev && devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Requirement 2: Implement a dynamic CSP enforcement layer using network request interceptors in the main process
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = !!process.env.VITE_DEV_SERVER_URL;
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    let csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none';";
    if (isDev && devUrl) {
      const devHost = new URL(devUrl).host;
      csp = `default-src 'self' http://${devHost} ws://${devHost}; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://${devHost}; style-src 'self' 'unsafe-inline' http://${devHost}; img-src 'self' data: blob: http://${devHost}; connect-src 'self' http://${devHost} ws://${devHost}; font-src 'self' data: http://${devHost}; object-src 'none'; base-uri 'none';`;
    }
    
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
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
