import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

let mainWindow: BrowserWindow | null = null;
let currentProjectFolder: string | null = null;
let currentProjectManifest: any = null;

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ lastProject: currentProjectFolder }));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return data.lastProject || null;
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
  return null;
}

async function loadProject(manifestPath: string) {
  const content = await fs.promises.readFile(manifestPath, 'utf-8');
  currentProjectManifest = JSON.parse(content);
  currentProjectFolder = path.dirname(manifestPath);
  saveSettings();
  
  return {
    manifestPath,
    manifest: currentProjectManifest,
    projectFolder: currentProjectFolder
  };
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
  protocol.registerFileProtocol('asset', (request, callback) => {
    const urlPath = decodeURIComponent(request.url.replace(/^asset:\/\//, ''));
    if (!currentProjectFolder) {
      return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
    }
    
    const absolutePath = path.resolve(currentProjectFolder, urlPath);
    
    // Security check: must be inside currentProjectFolder
    if (!absolutePath.startsWith(currentProjectFolder)) {
      return callback({ error: -2 }); // net::ERR_FAILED (access denied)
    }
    
    callback({ path: absolutePath });
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

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('dialog:openProject', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Project Manifest', extensions: ['json', 'jproj'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  
  return await loadProject(filePaths[0]);
});

ipcMain.handle('project:getLastOpened', async () => {
  const lastProjectFolder = loadSettings();
  if (lastProjectFolder && fs.existsSync(lastProjectFolder)) {
    try {
       // Look for a manifest in this folder
       const files = await fs.promises.readdir(lastProjectFolder);
       const manifestFile = files.find(f => f.endsWith('.json') || f.endsWith('.jproj'));
       if (manifestFile) {
         return await loadProject(path.join(lastProjectFolder, manifestFile));
       }
    } catch (e) {
      console.error('Error auto-loading project', e);
    }
  }
  return null;
});

ipcMain.handle('dialog:saveSceneData', async (event, buffer: Uint8Array) => {
  // Use Uint8Array over IPC - SharedArrayBuffer serialization
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Project Files', extensions: ['json', 'jproj'] }]
  });
  if (canceled || !filePath) return false;
  
  // Note: For actual zero-copy shared memory we receive a buffer
  // Here buffer will be passed natively as an ArrayBuffer/Uint8Array or SharedArrayBuffer
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  return true;
});
