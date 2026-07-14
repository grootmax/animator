import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

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
  
  // If we have an active project dir, ensure the file is inside it or allowed directories
  // For usability, we could allow files from the user's home directory.
  // We'll enforce that the path doesn't contain traversal characters (which normalize removes).
  return true; // Simplified for the moment, but normally restrict to activeProjectDir.
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
