import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let isDirty = false;
let forceQuit = false;

const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');

function getRecentFiles(): string[] {
  try {
    if (fs.existsSync(recentFilesPath)) {
      return JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function addRecentFile(filePath: string) {
  let files = getRecentFiles();
  files = files.filter(f => f !== filePath);
  files.unshift(filePath);
  if (files.length > 10) files = files.slice(0, 10);
  fs.writeFileSync(recentFilesPath, JSON.stringify(files));
  updateMenu();
}

function updateMenu() {
  const recentFiles = getRecentFiles();
  const recentMenuTemplate: MenuItemConstructorOptions[] = recentFiles.map((file) => ({
    label: file,
    click: () => {
      mainWindow?.webContents.send('open-recent-file', file);
    }
  }));

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-open')
        },
        {
          label: 'Open Recent',
          submenu: recentMenuTemplate.length > 0 ? recentMenuTemplate : [{ label: 'No Recent Files', enabled: false }]
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu-save-as')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

  mainWindow.on('close', (e) => {
    if (isDirty && !forceQuit) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['Save', 'Don\'t Save', 'Cancel'],
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Do you want to save them before closing?'
      });
      
      if (choice === 0) {
        mainWindow?.webContents.send('request-save-and-close');
      } else if (choice === 1) {
        forceQuit = true;
        mainWindow?.close();
      }
    }
  });
}

app.whenReady().then(() => {
  updateMenu();
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

app.on('before-quit', (e) => {
  if (isDirty && !forceQuit) {
    e.preventDefault();
    if (mainWindow) {
      mainWindow.close(); // trigger the close event handler
    }
  }
});

// IPC Handlers
ipcMain.handle('dialog:showOpenDialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Supported Files', extensions: ['json', 'svg'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('dialog:showSaveDialog', async (_, defaultPath?: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: [
      { name: 'JSON files', extensions: ['json'] },
      { name: 'SVG files', extensions: ['svg'] }
    ]
  });
  if (canceled || !filePath) return null;
  return filePath;
});

ipcMain.handle('file:read', async (_, filePath: string) => {
  if (!fs.existsSync(filePath)) {
    let files = getRecentFiles();
    files = files.filter(f => f !== filePath);
    fs.writeFileSync(recentFilesPath, JSON.stringify(files));
    updateMenu();
    return { error: 'File Not Found' };
  }
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    addRecentFile(filePath);
    return { content, filePath, fileName: path.basename(filePath) };
  } catch (e: any) {
    return { error: e.message };
  }
});

ipcMain.handle('file:write', async (_, { filePath, content }) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    addRecentFile(filePath);
    isDirty = false;
    return { success: true, filePath, fileName: path.basename(filePath) };
  } catch (e: any) {
    return { error: e.message };
  }
});

ipcMain.handle('getRecentFiles', () => getRecentFiles());

ipcMain.on('set-dirty', (_, dirty) => {
  isDirty = dirty;
});

ipcMain.on('force-close', () => {
  forceQuit = true;
  mainWindow?.close();
});
