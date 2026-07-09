import { _electron as electron, test, expect } from '@playwright/test';
import { join } from 'path';

test.describe('Editor E2E Tests', () => {
  let electronApp: any;
  let window: any;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: [join(__dirname, '../dist-electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'development',
      }
    });
    
    window = await electronApp.firstWindow();
    window.on('console', (msg: any) => console.log('BROWSER LOG:', msg.text()));
    window.on('pageerror', (err: any) => console.log('BROWSER ERROR:', err));
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('secure communication bridge correctly exposes the expected API surface', async () => {
    const apiSurface = await window.evaluate(() => {
      const api = (window as any).electronAPI;
      return {
        isDefined: !!api,
        hasOpenFile: typeof api?.openFile === 'function',
        hasSaveFile: typeof api?.saveFile === 'function',
      };
    });

    expect(apiSurface.isDefined).toBe(true);
    expect(apiSurface.hasOpenFile).toBe(true);
    expect(apiSurface.hasSaveFile).toBe(true);
  });

  test('successfully simulates the "Import SVG" workflow by mocking native file picker response', async () => {
    // Mock the IPC response for dialog:openFile
    await electronApp.evaluate(({ ipcMain }: any) => {
      ipcMain.removeHandler('dialog:openFile');
      ipcMain.handle('dialog:openFile', () => {
        return '<svg xmlns="http://www.w3.org/2000/svg"><rect id="mock-svg-rect" x="10" y="10" width="100" height="100" fill="#ff0000"/></svg>';
      });
    });

    await window.waitForLoadState('domcontentloaded');

    // Wait for the app to load by checking for the Layers panel empty state
    await expect(window.locator('text=No layers yet')).toBeVisible();

    // Click the Import SVG button
    await window.locator('button[title="Import SVG"]').click();

    // Verify the UI updates to show the new node
    // According to LayerPanel.tsx, the node name or type will be shown. For a <rect> with id mock-svg-rect, it will be mock-svg-rect.
    // Also the 'No layers yet' text should disappear.
    await expect(window.locator('text=No layers yet')).not.toBeVisible();
    await expect(window.locator('text=mock-svg-rect')).toBeVisible();
  });
});
