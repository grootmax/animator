import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before importing anything that uses it
vi.mock('electron', () => {
  class MockBrowserWindow {
    loadURL = vi.fn();
    loadFile = vi.fn();
    static getAllWindows = vi.fn().mockReturnValue([]);
  }

  return {
    app: {
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
    },
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
      invoke: vi.fn(),
    },
  };
});

// Mock fs to avoid actual file operations
vi.mock('fs', () => {
  const fsMock = {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return {
    ...fsMock,
    default: fsMock,
  };
});

describe('IPC Integrity Suite', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('validates contextBridge isolates renderer from main process', async () => {
    const { contextBridge, ipcRenderer } = await import('electron');
    await import('../preload');
    
    // Strict check for exactly what is exposed
    const exposedAPI = (contextBridge.exposeInMainWorld as any).mock.calls[0][1];
    expect(Object.keys(exposedAPI)).toEqual(['openFile', 'saveFile']);
    
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.objectContaining({
        openFile: expect.any(Function),
        saveFile: expect.any(Function),
      })
    );

    // Also test that the exposed functions call ipcRenderer.invoke correctly
    const api = exposedAPI;
    
    await api.openFile();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('dialog:openFile');
    
    await api.saveFile('test content');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('dialog:saveFile', 'test content');
  });

  it('verifies all IPC channels defined for native file dialogs request/response integrity', async () => {
    const { ipcMain, dialog } = await import('electron');
    const fs = (await import('fs')).default || await import('fs');
    
    await import('../main');

    const handleMock = ipcMain.handle as any;
    
    const openFileHandlerCall = handleMock.mock.calls.find((call: any) => call[0] === 'dialog:openFile');
    const saveFileHandlerCall = handleMock.mock.calls.find((call: any) => call[0] === 'dialog:saveFile');
    
    expect(openFileHandlerCall).toBeDefined();
    expect(saveFileHandlerCall).toBeDefined();

    const openFileHandler = openFileHandlerCall[1];
    const saveFileHandler = saveFileHandlerCall[1];

    // Test dialog:openFile - Success
    (dialog.showOpenDialog as any).mockResolvedValue({ canceled: false, filePaths: ['/test/path.svg'] });
    (fs.promises.readFile as any).mockResolvedValue('<svg></svg>');

    let openResult = await openFileHandler();
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      properties: ['openFile'],
      filters: [{ name: 'SVG files', extensions: ['svg'] }]
    }));
    expect(fs.promises.readFile).toHaveBeenCalledWith('/test/path.svg', 'utf-8');
    expect(openResult).toBe('<svg></svg>');

    // Test dialog:openFile - Canceled
    (dialog.showOpenDialog as any).mockResolvedValue({ canceled: true, filePaths: [] });
    openResult = await openFileHandler();
    expect(openResult).toBeNull();

    // Test dialog:saveFile - Success
    (dialog.showSaveDialog as any).mockResolvedValue({ canceled: false, filePath: '/test/path.json' });
    (fs.promises.writeFile as any).mockResolvedValue(undefined);

    let saveResult = await saveFileHandler(null, '{"test":true}');
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    }));
    expect(fs.promises.writeFile).toHaveBeenCalledWith('/test/path.json', '{"test":true}', 'utf-8');
    expect(saveResult).toBe(true);

    // Test dialog:saveFile - Canceled
    (dialog.showSaveDialog as any).mockResolvedValue({ canceled: true, filePath: undefined });
    saveResult = await saveFileHandler(null, '{"test":false}');
    expect(saveResult).toBe(false);
  });
});
