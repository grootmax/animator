import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

// Register custom protocol securely before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let activeProjectPath: string | null = null;

function getSessionFilePath() {
  return path.join(app.getPath('userData'), 'session.json');
}

function updateSessionFile(projectPath: string | null) {
  try {
    if (projectPath) {
      activeProjectPath = projectPath;
      const sessionData = { activeProjectPath: projectPath };
      fs.writeFileSync(getSessionFilePath(), JSON.stringify(sessionData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to write session file:', err);
  }
}

function loadSessionFile(): string | null {
  try {
    const sessionFile = getSessionFilePath();
    if (fs.existsSync(sessionFile)) {
      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      if (data.activeProjectPath && fs.existsSync(data.activeProjectPath)) {
        activeProjectPath = data.activeProjectPath;
        return activeProjectPath;
      }
    }
  } catch (err) {
    console.error('Failed to read session file:', err);
  }
  return null;
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
  protocol.handle('asset', (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      // Windows path fix if it starts with /C:/
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      if (!activeProjectPath) {
        return new Response('Forbidden: No active project directory', { status: 403 });
      }
      
      const activeProjectDir = path.dirname(activeProjectPath);
      const relative = path.relative(activeProjectDir, filePath);
      // Ensure the resolved file path lies inside the active project directory
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return new Response('Forbidden: File outside active project directory', { status: 403 });
      }

      const fileUrl = pathToFileURL(filePath).toString();
      return net.fetch(fileUrl);
    } catch (err) {
      console.error('Asset protocol error:', err);
      return new Response('Internal Error', { status: 500 });
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

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

// Original saveFile for SVG exports, etc.
ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

// High Performance Binary Buffer Transfers
ipcMain.handle('file:readBinary', async (_, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return buffer; // Electron safely serializes Buffer -> Uint8Array to renderer
  } catch (err) {
    console.error('Error reading binary file:', err);
    return null;
  }
});

ipcMain.handle('file:writeBinary', async (_, filePath: string, data: Uint8Array) => {
  try {
    await fs.promises.writeFile(filePath, Buffer.from(data));
    return true;
  } catch (err) {
    console.error('Error writing binary file:', err);
    return false;
  }
});

// Project state and persistence
ipcMain.handle('project:getInitialState', async () => {
  const projectPath = loadSessionFile();
  if (projectPath) {
    try {
      const content = await fs.promises.readFile(projectPath, 'utf-8');
      return { path: projectPath, content: JSON.parse(content) };
    } catch (err) {
      console.error('Failed to load project file:', err);
      return null;
    }
  }
  return null;
});

ipcMain.handle('project:save', async (_, projectPath: string | null, content: string) => {
  let targetPath = projectPath;
  if (!targetPath) {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON Project files', extensions: ['json'] }]
    });
    if (canceled || !filePath) return null;
    targetPath = filePath;
  }
  
  try {
    await fs.promises.writeFile(targetPath, content, 'utf-8');
    updateSessionFile(targetPath);
    return targetPath;
  } catch (err) {
    console.error('Failed to save project file:', err);
    return null;
  }
});
