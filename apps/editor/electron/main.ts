import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
const watchers = new Map<string, fs.FSWatcher>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
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
    filters: [{ name: 'Project/SVG', extensions: ['svg', 'json'] }]
  });
  if (canceled) return null;
  const content = await fs.promises.readFile(filePaths[0], 'utf-8');
  return { content, filePath: filePaths[0] };
});

ipcMain.handle('dialog:openAsset', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Media files', extensions: ['png', 'jpg', 'jpeg', 'tiff', 'mp4', 'mov'] }
    ]
  });
  if (canceled) return null;
  const stat = await fs.promises.stat(filePaths[0]);
  return { path: filePaths[0], timestamp: stat.mtimeMs };
});

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('fs:findFileRecursively', async (_, dirPath: string, fileName: string) => {
  async function searchDir(dir: string): Promise<string | null> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await searchDir(fullPath);
        if (found) return found;
      } else if (entry.name === fileName) {
        return fullPath;
      }
    }
    return null;
  }
  return searchDir(dirPath);
});

ipcMain.handle('fs:readFileBinary', async (_, filePath: string) => {
  try {
    return await fs.promises.readFile(filePath);
  } catch (err) {
    return null;
  }
});

ipcMain.handle('fs:resolveRelative', (_, baseDir: string, relativePath: string) => {
  return path.resolve(baseDir, relativePath);
});

ipcMain.handle('fs:dirname', (_, filePath: string) => {
  return path.dirname(filePath);
});

ipcMain.handle('fs:relative', (_, from: string, to: string) => {
  return path.relative(from, to);
});

ipcMain.handle('fs:watchFile', (_, filePath: string) => {
  if (watchers.has(filePath)) return;
  try {
    const watcher = fs.watch(filePath, (eventType) => {
      if (mainWindow) {
        mainWindow.webContents.send('fs:fileChanged', filePath);
      }
    });
    watchers.set(filePath, watcher);
  } catch (err) {
    console.error('Failed to watch file', filePath, err);
  }
});

ipcMain.handle('fs:unwatchFile', (_, filePath: string) => {
  const watcher = watchers.get(filePath);
  if (watcher) {
    watcher.close();
    watchers.delete(filePath);
  }
});

ipcMain.handle('dialog:saveProject', async (_, exportData: any) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON Project', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  
  const projectDir = path.dirname(filePath);
  if (exportData.assets) {
    for (const asset of Object.values<any>(exportData.assets)) {
      if (asset.path) {
        asset.relativePath = path.relative(projectDir, asset.path);
      }
    }
  }

  await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
  return filePath;
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return filePath;
});
