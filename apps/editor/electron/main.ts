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
  const filters = [
    { name: 'JSON files', extensions: ['json'] },
    { name: 'SVG files', extensions: ['svg'] }
  ];
  const { canceled, filePath } = await dialog.showSaveDialog({ filters });
  
  if (canceled || !filePath) return { success: false, canceled: true };
  
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const validExtensions = filters.flatMap(f => f.extensions);
  
  if (!ext || !validExtensions.includes(ext)) {
    return { success: false, error: 'Invalid file extension. Allowed extensions are: ' + validExtensions.join(', ') };
  }

  if (ext === 'json') {
    try {
      JSON.parse(content);
    } catch (e) {
      return { success: false, error: 'Invalid JSON content.' };
    }
  }

  await fs.promises.writeFile(filePath, content, 'utf-8');
  return { success: true };
});
