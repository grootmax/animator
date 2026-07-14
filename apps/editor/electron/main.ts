import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
  let isJson = false;
  let isSvg = false;
  let parsedJson: any = null;

  const trimmed = content.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      parsedJson = JSON.parse(content);
      isJson = true;
    } catch {
      // not valid JSON
    }
  } else if (trimmed.toLowerCase().startsWith('<svg') && trimmed.toLowerCase().endsWith('</svg>')) {
    isSvg = true;
  }

  if (isJson) {
    if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
      dialog.showErrorBox('Save Failed', 'The project data is invalid or corrupted.');
      return false;
    }
    if (!parsedJson.scene || !parsedJson.animations) {
      dialog.showErrorBox('Save Failed', 'The project data is invalid or corrupted.');
      return false;
    }
  } else if (isSvg) {
    // Basic structural validation for SVG to ensure it's not arbitrary data
    if (!trimmed.includes('<') || !trimmed.includes('>')) {
      dialog.showErrorBox('Save Failed', 'The project data is invalid or corrupted.');
      return false;
    }
  } else {
    dialog.showErrorBox('Save Failed', 'The project data is invalid or corrupted.');
    return false;
  }

  const filters = isJson 
    ? [{ name: 'JSON files', extensions: ['json'] }]
    : [{ name: 'SVG files', extensions: ['svg'] }];

  const { canceled, filePath } = await dialog.showSaveDialog({ filters });
  
  if (canceled || !filePath) return false;

  const ext = path.extname(filePath).toLowerCase();
  
  if ((isJson && ext !== '.json') || (isSvg && ext !== '.svg')) {
    dialog.showErrorBox('Save Failed', 'The file extension is not permitted.');
    return false;
  }

  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});
