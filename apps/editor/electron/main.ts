import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

let mainWindow: BrowserWindow | null = null;
let activeProjectPath: string | null = null;
let tempProjectPath: string | null = null;

function getWorkingProjectDir() {
  if (activeProjectPath) return activeProjectPath;
  if (!tempProjectPath) {
    tempProjectPath = fs.mkdtempSync(path.join(app.getPath('temp'), 'jules-project-'));
    fs.mkdirSync(path.join(tempProjectPath, 'assets'), { recursive: true });
  }
  return tempProjectPath;
}



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true // Important for custom protocol
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
    const currentDir = getWorkingProjectDir();
    if (!currentDir) {
      callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      return;
    }
    
    // request.url is something like asset://assets/my-image.png
    const url = request.url.substring('asset://'.length);
    const decodedUrl = decodeURIComponent(url);
    const targetPath = path.resolve(currentDir, decodedUrl);
    
    // Security check: Must be inside the project directory
    if (!targetPath.startsWith(currentDir)) {
      callback({ error: -3 }); // net::ERR_ACCESS_DENIED
      return;
    }
    
    callback({ path: targetPath });
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

ipcMain.handle('project:save', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Project Directory',
    buttonLabel: 'Save Project',
    properties: ['createDirectory']
  });
  
  if (canceled || !filePath) return false;
  
  await fs.promises.mkdir(filePath, { recursive: true });
  await fs.promises.mkdir(path.join(filePath, 'assets'), { recursive: true });
  
  const currentDir = getWorkingProjectDir();
  if (currentDir && currentDir !== filePath) {
    const oldAssets = path.join(currentDir, 'assets');
    const newAssets = path.join(filePath, 'assets');
    if (fs.existsSync(oldAssets)) {
      const files = await fs.promises.readdir(oldAssets);
      for (const file of files) {
        await fs.promises.copyFile(path.join(oldAssets, file), path.join(newAssets, file));
      }
    }
  }
  
  activeProjectPath = filePath;
  await fs.promises.writeFile(path.join(filePath, 'manifest.json'), content, 'utf-8');
  return true;
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Project Manifest or JSON', extensions: ['json'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  
  const selectedPath = filePaths[0];
  const stat = await fs.promises.stat(selectedPath);
  
  let manifestContent = '';
  if (stat.isDirectory()) {
    activeProjectPath = selectedPath;
    manifestContent = await fs.promises.readFile(path.join(selectedPath, 'manifest.json'), 'utf-8');
  } else {
    const content = await fs.promises.readFile(selectedPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Migration logic
    if (parsed.scene) {
      let needsMigration = false;
      const scene = parsed.scene;
      for (const key of Object.keys(scene)) {
        const node = scene[key];
        if (node.type === 'sprite' && node.assetUrl && node.assetUrl.startsWith('data:image')) {
          needsMigration = true;
          break;
        }
      }
      
      if (needsMigration) {
        const newProjPath = selectedPath.replace(/\.json$/, '_migrated');
        await fs.promises.mkdir(newProjPath, { recursive: true });
        await fs.promises.mkdir(path.join(newProjPath, 'assets'), { recursive: true });
        
        for (const key of Object.keys(scene)) {
          const node = scene[key];
          if (node.type === 'sprite' && node.assetUrl && node.assetUrl.startsWith('data:image')) {
            const matches = node.assetUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1];
              const b64Data = matches[2];
              const fileName = `${node.id}.${ext}`;
              const buffer = Buffer.from(b64Data, 'base64');
              await fs.promises.writeFile(path.join(newProjPath, 'assets', fileName), buffer);
              node.assetUrl = `assets/${fileName}`;
            }
          }
        }
        activeProjectPath = newProjPath;
        manifestContent = JSON.stringify(parsed, null, 2);
        await fs.promises.writeFile(path.join(newProjPath, 'manifest.json'), manifestContent, 'utf-8');
      } else {
        activeProjectPath = path.dirname(selectedPath);
        manifestContent = content;
      }
    } else {
      activeProjectPath = path.dirname(selectedPath);
      manifestContent = content;
    }
  }
  return manifestContent;
});

ipcMain.handle('project:importAsset', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  
  const sourcePath = filePaths[0];
  const fileName = `${Date.now()}_${path.basename(sourcePath)}`;
  const currentDir = getWorkingProjectDir();
  
  const destPath = path.join(currentDir, 'assets', fileName);
  await fs.promises.copyFile(sourcePath, destPath);
  
  return `assets/${fileName}`;
});
