import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

let mainWindow: BrowserWindow | null = null;

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

ipcMain.handle('dialog:openImage', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  
  const filePath = filePaths[0];
  const buffer = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
  const name = path.basename(filePath);
  
  return {
    name,
    mimeType,
    data: buffer,
    extension: ext.replace('.', '')
  };
});

ipcMain.handle('dialog:saveProjectBundle', async (_, exportDataStr: string, assets: { id: string, data: Uint8Array, extension: string }[]) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Project Bundle',
    properties: ['createDirectory'],
  });
  
  if (canceled || !filePath) return false;
  
  // filePath might be a folder. Let's make sure it acts as a bundle directory.
  // We'll treat filePath as the bundle directory.
  try {
    await fs.promises.mkdir(filePath, { recursive: true });
    await fs.promises.writeFile(path.join(filePath, 'scene.json'), exportDataStr, 'utf-8');
    
    const assetsDir = path.join(filePath, 'assets');
    if (!fs.existsSync(assetsDir)) {
      await fs.promises.mkdir(assetsDir, { recursive: true });
    }
    
    for (const asset of assets) {
      const assetPath = path.join(assetsDir, `${asset.id}.${asset.extension}`);
      await fs.promises.writeFile(assetPath, asset.data);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving bundle:', error);
    return false;
  }
});

ipcMain.handle('dialog:openProjectBundle', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Project Bundles or JSON', extensions: ['json'] }],
    title: 'Open Project Bundle or Legacy JSON'
  });
  
  if (canceled || filePaths.length === 0) return null;
  
  const selectedPath = filePaths[0];
  try {
    const stat = await fs.promises.stat(selectedPath);
    let sceneJson = '';
    const loadedAssets = [];

    if (stat.isDirectory()) {
      const bundlePath = selectedPath;
      const scenePath = path.join(bundlePath, 'scene.json');
      
      if (fs.existsSync(scenePath)) {
        sceneJson = await fs.promises.readFile(scenePath, 'utf-8');
      } else {
        // Legacy fallback within directory
        const legacyFiles = fs.readdirSync(bundlePath).filter(f => f.endsWith('.json'));
        if (legacyFiles.length > 0) {
          sceneJson = await fs.promises.readFile(path.join(bundlePath, legacyFiles[0]), 'utf-8');
        } else {
          return null;
        }
      }
      
      const assetsDir = path.join(bundlePath, 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = await fs.promises.readdir(assetsDir);
        for (const file of files) {
          const filePath = path.join(assetsDir, file);
          const buffer = await fs.promises.readFile(filePath);
          const ext = path.extname(file).replace('.', '');
          const id = path.basename(file, path.extname(file));
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          
          loadedAssets.push({
            id,
            name: file,
            mimeType,
            extension: ext,
            data: buffer
          });
        }
      }
    } else {
      // It's a file, assume legacy JSON project
      sceneJson = await fs.promises.readFile(selectedPath, 'utf-8');
    }
    
    return {
      sceneJson,
      assets: loadedAssets
    };
  } catch (error) {
    console.error('Error opening bundle:', error);
    return null;
  }
});
