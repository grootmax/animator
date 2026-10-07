import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { setupSecurity } from './security';

// Register custom protocol as privileged
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true, stream: true } }
]);

setupSecurity();

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
    mainWindow.loadFile(path.resolve(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  setupSecurity();
  createWindow();
  
  // Custom asset protocol handler
  protocol.handle('asset', (request) => {
    const urlPath = decodeURIComponent(request.url.replace('asset://', ''));
    // Basic security check: resolve path and check if it exists
    const safePath = path.resolve(urlPath);
    return net.fetch(`file://${safePath}`);
  });

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
  if (process.platform !== 'darwin' || process.env.TEST_MODE === 'true') {
    app.quit();
  }
});

// Recent files registry
function getRecentFilesPath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

ipcMain.handle('registry:getRecentFiles', async () => {
  try {
    const data = await fs.promises.readFile(getRecentFilesPath(), 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('registry:addRecentFile', async (_, filePath: string) => {
  try {
    const recentPath = getRecentFilesPath();
    let recentFiles: string[] = [];
    try {
      const data = await fs.promises.readFile(recentPath, 'utf-8');
      recentFiles = JSON.parse(data);
    } catch (e) {
      // Ignore
    }
    recentFiles = recentFiles.filter(p => p !== filePath);
    recentFiles.unshift(filePath);
    if (recentFiles.length > 10) {
      recentFiles = recentFiles.slice(0, 10);
    }
    await fs.promises.writeFile(recentPath, JSON.stringify(recentFiles), 'utf-8');
    return recentFiles;
  } catch (e) {
    return [];
  }
});

function addRecent(filePath: string) {
  const recentPath = getRecentFilesPath();
  let recentFiles: string[] = [];
  try {
    const data = fs.readFileSync(recentPath, 'utf-8');
    recentFiles = JSON.parse(data);
  } catch (e) {}
  recentFiles = recentFiles.filter(p => p !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > 10) recentFiles = recentFiles.slice(0, 10);
  fs.writeFileSync(recentPath, JSON.stringify(recentFiles), 'utf-8');
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  if (process.env.TEST_MODE === 'true') {
    const testFilePath = path.join(__dirname, '../test-resources/test.svg');
    return fs.promises.readFile(testFilePath, 'utf-8');
  }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  addRecent(filePaths[0]);
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:openFileWithMetadata', async () => {
  if (process.env.TEST_MODE === 'true') {
    const testFilePath = path.join(__dirname, '../test-resources/test.svg');
    const content = await fs.promises.readFile(testFilePath, 'utf-8');
    return { content, filePath: testFilePath };
  }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const content = await fs.promises.readFile(filePaths[0], 'utf-8');
  addRecent(filePaths[0]);
  return { content, filePath: filePaths[0] };
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  if (process.env.TEST_MODE === 'true') {
    const testFilePath = process.env.TEST_SAVE_PATH || path.join(os.tmpdir(), 'test-save.json');
    await fs.promises.writeFile(testFilePath, content, 'utf-8');
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
    addRecent(filePath);
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('dialog:saveFileDirect', async (_, filePath: string, content: string) => {
  await fs.promises.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return true;
});

ipcMain.handle('dialog:saveFileWithDialog', async (_, content: string) => {
  if (process.env.TEST_MODE === 'true') {
    const testFilePath = process.env.TEST_SAVE_PATH || path.join(os.tmpdir(), 'test-save.json');
    await fs.promises.writeFile(testFilePath, content, 'utf-8');
    return testFilePath;
  }
  const { canceled, filePath } = await dialog.showSaveDialog({});
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return filePath;
});

// Binary IPC handlers
ipcMain.handle('dialog:openBinaryFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return null;
  const buffer = await fs.promises.readFile(filePaths[0]);
  addRecent(filePaths[0]);
  return { buffer: buffer.buffer, filePath: filePaths[0] };
});

ipcMain.handle('dialog:saveBinaryFileDirect', async (_, filePath: string, buffer: ArrayBuffer) => {
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  addRecent(filePath);
  return true;
});


ipcMain.handle('dialog:saveBinaryFileWithDialog', async (_, buffer: ArrayBuffer) => {
  if (process.env.TEST_MODE === 'true') {
    const testFilePath = process.env.TEST_SAVE_PATH || path.join(os.tmpdir(), 'test-save.json');
    await fs.promises.writeFile(testFilePath, Buffer.from(buffer));
    return testFilePath;
  }
  const { canceled, filePath } = await dialog.showSaveDialog({});
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  addRecent(filePath);
  return filePath;
});
