const assert = require('assert');
const path = require('path');

// Mocks for File System
const mockFsFiles = {};
const mockFs = {
  promises: {
    readFile: async (filePath) => {
      if (!(filePath in mockFsFiles)) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      }
      return mockFsFiles[filePath];
    },
    writeFile: async (filePath, content) => {
      mockFsFiles[filePath] = content;
    }
  }
};

// Mocks for Electron
const mockIpcRenderer = {
  invoke: async (channel, ...args) => {
    return `Invoked ${channel} with ${args.join(', ')}`;
  }
};

const mockContextBridge = {
  exposed: {},
  exposeInMainWorld: (apiKey, api) => {
    mockContextBridge.exposed[apiKey] = api;
  }
};

const mockIpcMainHandlers = {};
const mockIpcMain = {
  handle: (channel, listener) => {
    mockIpcMainHandlers[channel] = listener;
  }
};

const mockDialog = {
  _openDialogResult: { canceled: true, filePaths: [] },
  _saveDialogResult: { canceled: true, filePath: '' },
  showOpenDialog: async (options) => mockDialog._openDialogResult,
  showSaveDialog: async (options) => mockDialog._saveDialogResult,
};

const mockApp = {
  whenReady: () => Promise.resolve(),
  on: () => {},
  quit: () => {}
};

const mockBrowserWindow = class {
  static getAllWindows() { return []; }
  loadURL() {}
  loadFile() {}
};

const mockElectron = {
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  app: mockApp,
  BrowserWindow: mockBrowserWindow
};

// Inject the mock electron into the module cache
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return mockElectron;
  }
  if (request === 'fs') {
    return mockFs;
  }
  return originalLoad(request, parent, isMain);
};

// Start tests
async function runTests() {
  console.log('--- Running Bridge Verification Suite ---');

  // Load the compiled bridge components
  try {
    require('../dist-electron/main.js');
    require('../dist-electron/preload.js');
  } catch (err) {
    console.error('Failed to load bridge components. Ensure they are compiled.');
    console.error(err);
    process.exit(1);
  }

  try {
    // 1. Verify Preload exposed API
    const api = mockContextBridge.exposed['electronAPI'];
    assert.ok(api, 'electronAPI should be exposed to the main world');
    assert.strictEqual(typeof api.openFile, 'function', 'openFile function should exist');
    assert.strictEqual(typeof api.saveFile, 'function', 'saveFile function should exist');

    // Verify preload to IPC routing
    const openRes = await api.openFile();
    assert.strictEqual(openRes, 'Invoked dialog:openFile with ', 'openFile should correctly route to dialog:openFile');
    
    const saveRes = await api.saveFile('test-content');
    assert.strictEqual(saveRes, 'Invoked dialog:saveFile with test-content', 'saveFile should correctly route to dialog:saveFile');

    console.log('✅ Preload API verification passed.');

    // 2. Verify Main IPC Handlers
    assert.ok(mockIpcMainHandlers['dialog:openFile'], 'dialog:openFile handler must be registered');
    assert.ok(mockIpcMainHandlers['dialog:saveFile'], 'dialog:saveFile handler must be registered');

    // 3. Mock responses for native file dialogs (success and cancel states)
    
    // openFile - Cancelled
    mockDialog._openDialogResult = { canceled: true, filePaths: [] };
    const openCancel = await mockIpcMainHandlers['dialog:openFile']();
    assert.strictEqual(openCancel, null, 'openFile should return null when canceled');

    // openFile - Success
    const mockFilePath = path.join(__dirname, 'test-mock-file.svg');
    mockFsFiles[mockFilePath] = '<svg></svg>';
    mockDialog._openDialogResult = { canceled: false, filePaths: [mockFilePath] };
    const openSuccess = await mockIpcMainHandlers['dialog:openFile']();
    assert.strictEqual(openSuccess, '<svg></svg>', 'openFile should return file content on success');
    delete mockFsFiles[mockFilePath];

    // saveFile - Cancelled
    mockDialog._saveDialogResult = { canceled: true, filePath: '' };
    const saveCancel = await mockIpcMainHandlers['dialog:saveFile']({}, 'content');
    assert.strictEqual(saveCancel, false, 'saveFile should return false when canceled');

    // saveFile - Success
    const mockSavePath = path.join(__dirname, 'test-save-file.json');
    mockDialog._saveDialogResult = { canceled: false, filePath: mockSavePath };
    const saveSuccess = await mockIpcMainHandlers['dialog:saveFile']({}, '{"data": 123}');
    assert.strictEqual(saveSuccess, true, 'saveFile should return true on success');
    const savedContent = mockFsFiles[mockSavePath];
    assert.strictEqual(savedContent, '{"data": 123}', 'saveFile should write the correct content');
    delete mockFsFiles[mockSavePath];

    console.log('✅ Main Process IPC Handlers verification passed.');

    console.log('--- All tests completed successfully! ---');
    process.exit(0);

  } catch (err) {
    console.error('❌ Verification failed:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
