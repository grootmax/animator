import { _electron as electron, test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

let electronApp;
let window;

test.describe('Core E2E Developer Suite', () => {
  test.beforeEach(async () => {
    // Check if the build artifacts exist to ensure build process was successful
    const mainPath = path.resolve(__dirname, '../dist-electron/main.js');
    const preloadPath = path.resolve(__dirname, '../dist-electron/preload.js');
    const indexPath = path.resolve(__dirname, '../dist/index.html');
    
    expect(fs.existsSync(mainPath)).toBe(true);
    expect(fs.existsSync(preloadPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);

    electronApp = await electron.launch({
      args: [mainPath],
      env: { ...process.env, VITE_DEV_SERVER_URL: '' } // Ensure it loads from dist
    });
    window = await electronApp.firstWindow();
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Validating Shell Security: Secure IPC bridge is initialized', async () => {
    // Wait for the window to load
    await window.waitForLoadState('domcontentloaded');
    
    // Evaluate in the browser context to check if electronAPI exists
    const hasElectronAPI = await window.evaluate(() => {
      return window.electronAPI !== undefined;
    });
    
    expect(hasElectronAPI).toBe(true);

    const apiMethods = await window.evaluate(() => {
      return Object.keys(window.electronAPI || {});
    });

    expect(apiMethods).toContain('openFile');
    expect(apiMethods).toContain('saveFile');
  });

  test('Verifying File Persistence: Automate Open dialog and verify content in editor', async () => {
    await window.waitForLoadState('domcontentloaded');

    // Create a temporary SVG file to simulate importing
    const tempDir = path.resolve(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const testFilePath = path.resolve(tempDir, 'test-icon.svg');
    
    const svgContent = `<svg width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="red" id="imported-rect"/></svg>`;
    fs.writeFileSync(testFilePath, svgContent);

    // Override the showOpenDialog in the main process
    await electronApp.evaluate(async ({ dialog }, { filePath }) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [filePath]
        };
      };
    }, { filePath: testFilePath });

    // Ensure we start with 0 nodes. The layer panel should say something like or we can check the nodes array via window.__bridge.
    // Let's click the Import button
    await window.click('button[title="Import SVG"]');

    // After import, check if the store has the node or verify the UI (layer panel updates)
    // Verify node is present in the internal store
    await expect.poll(async () => {
      return await window.evaluate(() => {
        const store = (window as any).__bridge?.store;
        if (!store) return false;
        const state = store.getState();
        return state.nodes['imported-rect'] !== undefined;
      });
    }, {
      timeout: 5000,
    }).toBe(true);
  });

  test('Verifying File Persistence: Automate Save dialog and verify file existence on disk', async () => {
    await window.waitForLoadState('domcontentloaded');

    const tempDir = path.resolve(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const outputFilePath = path.resolve(tempDir, 'output-scene.json');

    // Clean up previous test file if exists
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Override the showSaveDialog in the main process
    await electronApp.evaluate(async ({ dialog }, { filePath }) => {
      dialog.showSaveDialog = async () => {
        return {
          canceled: false,
          filePath: filePath
        };
      };
    }, { filePath: outputFilePath });

    // Click "Add Test Anim" button to create some data
    await window.click('button:has-text("Add Test Anim")');

    // Click "Export JSON" to trigger the save flow
    await window.click('button[title="Export JSON"]');

    // Wait a short time for file system to write
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the file was created and contains expected data
    expect(fs.existsSync(outputFilePath)).toBe(true);
    
    const savedData = JSON.parse(fs.readFileSync(outputFilePath, 'utf-8'));
    expect(savedData.scene).toBeDefined();
    expect(Object.keys(savedData.scene).length).toBeGreaterThan(0);
  });
});
