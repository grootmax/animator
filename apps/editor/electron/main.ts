import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

let mainWindow: BrowserWindow | null = null;
let currentProjectDir: string | null = null;
let currentProjectManifestPath: string | null = null;

function getRecentPath() {
  return path.join(app.getPath('userData'), 'recent_project.txt');
}

function loadRecentProject() {
  try {
    const p = fs.readFileSync(getRecentPath(), 'utf-8');
    if (p && fs.existsSync(p)) {
      currentProjectManifestPath = p;
      currentProjectDir = path.dirname(p);
      return fs.readFileSync(p, 'utf-8');
    }
  } catch (e) {}
  return null;
}

function saveRecentProject(p: string) {
  try {
    fs.writeFileSync(getRecentPath(), p, 'utf-8');
  } catch(e) {}
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

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
  protocol.registerFileProtocol('asset', (request, callback) => {
    if (!currentProjectDir) {
      callback({ error: -6 });
      return;
    }
    let url = request.url.substring(8); // 'asset://' is 8 chars
    // strip query params if any
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) {
      url = url.substring(0, qIndex);
    }
    const decodedUrl = decodeURIComponent(url);
    const normalizedProjectDir = path.normalize(currentProjectDir);
    const resolvedPath = path.normalize(path.join(currentProjectDir, decodedUrl));
    
    // Check if resolvedPath is inside currentProjectDir
    if (resolvedPath !== normalizedProjectDir && !resolvedPath.startsWith(normalizedProjectDir + path.sep)) {
      callback({ error: -6 });
      return;
    }
    callback({ path: resolvedPath });
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

// Project Handlers
ipcMain.handle('project:loadRecent', () => {
  return loadRecentProject();
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Project Manifest', extensions: ['json'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  const p = filePaths[0];
  currentProjectManifestPath = p;
  currentProjectDir = path.dirname(p);
  saveRecentProject(p);
  return fs.promises.readFile(p, 'utf-8');
});

ipcMain.handle('project:save', async (_, content: string) => {
  if (!currentProjectManifestPath) {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'Project Manifest', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    currentProjectManifestPath = filePath;
    currentProjectDir = path.dirname(filePath);
    saveRecentProject(filePath);
  }
  await fs.promises.writeFile(currentProjectManifestPath, content, 'utf-8');
  return true;
});

ipcMain.handle('project:saveAs', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Project Manifest', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  currentProjectManifestPath = filePath;
  currentProjectDir = path.dirname(filePath);
  saveRecentProject(filePath);
  await fs.promises.writeFile(currentProjectManifestPath, content, 'utf-8');
  return true;
});

ipcMain.handle('project:readAssetBuffer', async (_, assetPath: string) => {
  if (!currentProjectDir) return null;
  let url = assetPath;
  if (url.startsWith('asset://')) url = url.substring(8);
  const qIndex = url.indexOf('?');
  if (qIndex !== -1) url = url.substring(0, qIndex);
  
  const decodedUrl = decodeURIComponent(url);
  const normalizedProjectDir = path.normalize(currentProjectDir);
  const resolvedPath = path.normalize(path.join(currentProjectDir, decodedUrl));
  if (resolvedPath !== normalizedProjectDir && !resolvedPath.startsWith(normalizedProjectDir + path.sep)) return null;
  try {
    return await fs.promises.readFile(resolvedPath);
  } catch (e) {
    return null;
  }
});
