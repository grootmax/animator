import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  const ALLOWED_EXTERNAL_DOMAINS = ['github.com', 'electronjs.org'];

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self';";
    
    if (process.env.VITE_DEV_SERVER_URL) {
      try {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
        const origin = devUrl.origin;
        csp = `default-src 'self' ${origin}; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${origin}; style-src 'self' 'unsafe-inline' ${origin}; connect-src 'self' ${origin} ws://${devUrl.host} wss://${devUrl.host}; font-src 'self' ${origin} data:; img-src 'self' ${origin} data:;`;
      } catch (e) {
        // Ignore
      }
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      try {
        const parsedUrl = new URL(navigationUrl);
        const isDev = !!process.env.VITE_DEV_SERVER_URL;
        
        if (isDev && process.env.VITE_DEV_SERVER_URL) {
          const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
          if (parsedUrl.origin === devUrl.origin) {
            return;
          }
        } else if (!isDev && parsedUrl.protocol === 'file:') {
          return;
        }

        if (parsedUrl.protocol === 'https:' && ALLOWED_EXTERNAL_DOMAINS.includes(parsedUrl.hostname)) {
          shell.openExternal(navigationUrl);
        }
      } catch (e) {
        // Ignore
      }
      
      event.preventDefault();
    });

    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol === 'https:' && ALLOWED_EXTERNAL_DOMAINS.includes(parsedUrl.hostname)) {
          shell.openExternal(url);
        }
      } catch (e) {
        // Ignore
      }
      return { action: 'deny' };
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
