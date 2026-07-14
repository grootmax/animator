import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;
let assetManifest: Record<string, string> = {};

// Session state storage
const configPath = path.join(app.getPath('userData'), 'recent-project.json');

function saveConfig(projectPath: string) {
  fs.writeFileSync(configPath, JSON.stringify({ recentProject: projectPath }), 'utf-8');
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return data.recentProject || null;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

// Custom protocol registration
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow local files if needed, but asset protocol should handle it
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  // Initialize with recent project if available
  const recent = loadConfig();
  if (recent && fs.existsSync(recent)) {
    currentProjectPath = recent;
    try {
      const projectData = JSON.parse(fs.readFileSync(recent, 'utf-8'));
      if (projectData.assets) {
        assetManifest = projectData.assets;
      }
    } catch (e) {}
  }
}

app.whenReady().then(() => {
  // Register custom protocol for streaming assets
  protocol.handle('asset', (request) => {
    const url = request.url.replace('asset://', '');
    const assetId = url.split('?')[0].split('#')[0]; // simple stripping
    
    let relativePath = assetManifest[assetId];
    if (relativePath && currentProjectPath) {
      const baseDir = path.dirname(currentProjectPath);
      const absolutePath = path.resolve(baseDir, relativePath);
      return net.fetch('file://' + absolutePath);
    }
    
    // fallback if absolute path used directly or debug
    return new Response('Not Found', { status: 404 });
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

ipcMain.handle('project:getRecent', async () => {
  if (currentProjectPath && fs.existsSync(currentProjectPath)) {
    const content = await fs.promises.readFile(currentProjectPath, 'utf-8');
    try {
      const data = JSON.parse(content);
      if (data.assets) assetManifest = data.assets;
    } catch (e) {}
    return content;
  }
  return null;
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Project Files', extensions: ['json'] },
      { name: 'SVG files', extensions: ['svg'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  
  const filePath = filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  
  if (filePath.endsWith('.json')) {
    currentProjectPath = filePath;
    saveConfig(filePath);
    try {
      const data = JSON.parse(content);
      if (data.assets) assetManifest = data.assets;
    } catch (e) {}
  }
  
  return content;
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  // If we already have a path, direct save
  if (currentProjectPath) {
    try {
      const data = JSON.parse(content);
      if (data.assets) assetManifest = data.assets;
    } catch (e) {}
    await fs.promises.writeFile(currentProjectPath, content, 'utf-8');
    return true;
  }
  
  // Otherwise prompt
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Project Files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  
  currentProjectPath = filePath;
  saveConfig(filePath);
  
  try {
    const data = JSON.parse(content);
    if (data.assets) assetManifest = data.assets;
  } catch (e) {}
  
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

// For explicitly saving as
ipcMain.handle('dialog:saveAs', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Project Files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  
  currentProjectPath = filePath;
  saveConfig(filePath);
  
  try {
    const data = JSON.parse(content);
    if (data.assets) assetManifest = data.assets;
  } catch (e) {}
  
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('dialog:addAsset', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  
  if (canceled || filePaths.length === 0) return null;
  
  const srcPath = filePaths[0];
  const assetId = 'asset-' + Date.now();
  
  if (!currentProjectPath) {
    // If project not saved yet, just return absolute path? No, must enforce saving first or save to temp.
    // The prompt says multi-file projects can be moved. We should store it relative to project.
    // If no project, prompt to save project first.
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Save Project First',
      message: 'Please save your project first before importing assets.'
    });
    return null;
  }
  
  const baseDir = path.dirname(currentProjectPath);
  const assetsDir = path.join(baseDir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  const fileName = path.basename(srcPath);
  const destPath = path.join(assetsDir, fileName);
  await fs.promises.copyFile(srcPath, destPath);
  
  // Store relative path
  assetManifest[assetId] = path.relative(baseDir, destPath).replace(/\\/g, '/');
  
  return { assetId, path: assetManifest[assetId] };
});
