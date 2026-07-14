import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;

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

ipcMain.handle('dialog:saveProject', async (_, contentString: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Project',
    properties: ['createDirectory'],
  });
  if (canceled || !filePath) return null;

  let projectPath = filePath;
  if (!projectPath.endsWith('.project')) {
    projectPath += '.project';
  }

  currentProjectPath = projectPath;

  if (!fs.existsSync(projectPath)) {
    await fs.promises.mkdir(projectPath, { recursive: true });
  }
  const assetsDir = path.join(projectPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    await fs.promises.mkdir(assetsDir, { recursive: true });
  }

  const content = JSON.parse(contentString);

  // Copy absolute paths to assets/
  if (content.scene) {
    for (const id in content.scene) {
      const node = content.scene[id];
      if (node.source && path.isAbsolute(node.source)) {
        const fileName = path.basename(node.source);
        const destPath = path.join(assetsDir, fileName);
        try {
          await fs.promises.copyFile(node.source, destPath);
          node.source = `assets/${fileName}`;
        } catch (e) {
          console.error("Failed to copy asset", e);
        }
      }
    }
  }

  await fs.promises.writeFile(path.join(projectPath, 'scene.json'), JSON.stringify(content, null, 2), 'utf-8');
  return JSON.stringify(content); // return the updated content with relative paths
});

ipcMain.handle('dialog:openProject', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;

  const projectPath = filePaths[0];
  const scenePath = path.join(projectPath, 'scene.json');

  if (!fs.existsSync(scenePath)) {
    return null; // Not a valid project
  }

  currentProjectPath = projectPath;
  return fs.promises.readFile(scenePath, 'utf-8');
});

ipcMain.handle('core:getProjectPath', () => currentProjectPath);
