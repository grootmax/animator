import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

let mainWindow: BrowserWindow | null = null;
let currentProjectDir: string | null = null;

const USER_DATA_PATH = app.getPath('userData');
const SESSION_FILE = path.join(USER_DATA_PATH, 'last-project.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Easier for local media, though custom protocol usually bypasses need for this
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
    if (!currentProjectDir) {
      return new Response(null, { status: 404 });
    }
    const urlPath = decodeURIComponent(request.url.replace('asset://', ''));
    const absolutePath = path.resolve(currentProjectDir, urlPath);
    return net.fetch(`file://${absolutePath}`);
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

function saveSession(projectPath: string) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ lastProject: projectPath }), 'utf-8');
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

// IPC Handlers
ipcMain.handle('project:getLastActive', async () => {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      if (data.lastProject && fs.existsSync(data.lastProject)) {
        currentProjectDir = data.lastProject;
        const manifestPath = path.join(currentProjectDir, 'project.json');
        if (fs.existsSync(manifestPath)) {
          return {
            projectDir: currentProjectDir,
            manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          };
        }
      }
    }
  } catch (err) {
    console.error('Failed to load last session:', err);
  }
  return null;
});

ipcMain.handle('project:create', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Create New Project Folder'
  });
  if (canceled || filePaths.length === 0) return null;
  
  const projectDir = filePaths[0];
  const assetsDir = path.join(projectDir, 'assets');
  const manifestPath = path.join(projectDir, 'project.json');
  
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const defaultManifest = {
    version: '2.0.0',
    name: path.basename(projectDir),
    scene: {
      nodes: {},
      rootId: 'root'
    },
    assets: []
  };

  fs.writeFileSync(manifestPath, JSON.stringify(defaultManifest, null, 2), 'utf-8');
  
  currentProjectDir = projectDir;
  saveSession(projectDir);
  
  return { projectDir, manifest: defaultManifest };
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Open Project Folder'
  });
  if (canceled || filePaths.length === 0) return null;

  const projectDir = filePaths[0];
  const manifestPath = path.join(projectDir, 'project.json');
  
  if (!fs.existsSync(manifestPath)) {
    dialog.showErrorBox('Invalid Project', 'No project.json found in the selected directory.');
    return null;
  }

  currentProjectDir = projectDir;
  saveSession(projectDir);
  
  return {
    projectDir,
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  };
});

ipcMain.handle('project:save', async (_, manifest: any) => {
  if (!currentProjectDir) return false;
  const manifestPath = path.join(currentProjectDir, 'project.json');
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Save failed', err);
    return false;
  }
});

ipcMain.handle('project:importAsset', async () => {
  if (!currentProjectDir) {
    dialog.showErrorBox('No Project', 'Please create or open a project first.');
    return null;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Media files', extensions: ['png', 'jpg', 'jpeg', 'mp4', 'webm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const ext = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, ext);
  const assetId = randomUUID();
  const fileName = `${baseName}-${assetId}${ext}`;
  const relativePath = `assets/${fileName}`;
  const destPath = path.join(currentProjectDir, relativePath);

  try {
    // Copy file in binary mode
    fs.copyFileSync(sourcePath, destPath);
    
    return {
      id: assetId,
      name: baseName + ext,
      relativePath: relativePath,
      type: ext.match(/\.(mp4|webm)$/i) ? 'video' : 'image'
    };
  } catch (err) {
    console.error('Failed to import asset:', err);
    return null;
  }
});

// Legacy Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});
