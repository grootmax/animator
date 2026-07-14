import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true // Important for custom protocol
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
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
