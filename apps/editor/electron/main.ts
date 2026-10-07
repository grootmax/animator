import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

let mainWindow: BrowserWindow | null = null;
let activeWorkspace: string | null = null;
let workspaceWatcher: fs.FSWatcher | null = null;

const HISTORY_FILE = path.join(app.getPath('userData'), 'workspace-history.json');
const ALLOWED_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.mp4']);

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { bypassCSP: true, supportFetchAPI: true, secure: true, standard: true } }
]);

function getHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return { recentWorkspaces: [], lastActive: null };
  }
}

function saveHistory(history: any) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf-8');
}

function isAllowedAsset(file: string) {
  const ext = path.extname(file).toLowerCase();
  return ALLOWED_EXTS.has(ext);
}

async function indexWorkspace(workspacePath: string) {
  try {
    const files = await fs.promises.readdir(workspacePath);
    return files
      .filter(f => isAllowedAsset(f))
      .map(f => ({
        name: f,
        path: path.join(workspacePath, f),
        url: `asset://${encodeURIComponent(f)}`
      }));
  } catch (e) {
    return [];
  }
}

async function updateManifest(workspacePath: string) {
  const manifestPath = path.join(workspacePath, 'workspace-manifest.json');
  const assets = await indexWorkspace(workspacePath);
  let manifest: any = { assets, scene: null };
  try {
    const existing = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
    manifest = { ...existing, assets };
  } catch (e) {}
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

async function setActiveWorkspace(workspacePath: string) {
  if (workspaceWatcher) {
    workspaceWatcher.close();
    workspaceWatcher = null;
  }
  activeWorkspace = workspacePath;
  const history = getHistory();
  if (!history.recentWorkspaces.includes(workspacePath)) {
    history.recentWorkspaces.unshift(workspacePath);
    if (history.recentWorkspaces.length > 10) history.recentWorkspaces.pop();
  }
  history.lastActive = workspacePath;
  saveHistory(history);

  const manifest = await updateManifest(workspacePath);

  // Watch for changes asynchronously
  workspaceWatcher = fs.watch(workspacePath, async (_eventType, filename) => {
    if (filename && filename !== 'workspace-manifest.json' && isAllowedAsset(filename)) {
      const newManifest = await updateManifest(workspacePath);
      if (mainWindow) {
        mainWindow.webContents.send('workspace-updated', newManifest);
      }
    }
  });

  return { workspacePath, manifest };
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
  protocol.registerFileProtocol('asset', (request, callback) => {
    const urlPath = decodeURIComponent(request.url.replace('asset://', ''));
    if (!activeWorkspace) {
      return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
    }
    const resolvedPath = path.resolve(activeWorkspace, urlPath);
    // Security check: ensure path is within the workspace
    if (!resolvedPath.startsWith(activeWorkspace)) {
      return callback({ error: -2 }); // net::ERR_FAILED
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

ipcMain.handle('workspace:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  return await setActiveWorkspace(filePaths[0]);
});

ipcMain.handle('workspace:getLastActive', async () => {
  const history = getHistory();
  if (history.lastActive && fs.existsSync(history.lastActive)) {
    return await setActiveWorkspace(history.lastActive);
  }
  return null;
});

ipcMain.handle('workspace:saveScene', async (_, sceneData: any) => {
  if (!activeWorkspace) return false;
  const manifestPath = path.join(activeWorkspace, 'workspace-manifest.json');
  try {
    const existing = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
    existing.scene = sceneData;
    await fs.promises.writeFile(manifestPath, JSON.stringify(existing, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

// Use binary buffer for IPC large file transfers if needed for some specific file operations
ipcMain.handle('fs:readFileBinary', async (_, filePath: string) => {
  try {
    return await fs.promises.readFile(filePath);
  } catch {
    return null;
  }
});
