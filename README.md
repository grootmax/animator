# High Performance Monorepo

## End-to-End (E2E) Testing

We use [Playwright](https://playwright.dev/) for our automated E2E tests, specifically tailored to test the Electron application shell. The testing framework is integrated locally and verifies the IPC (Inter-Process Communication) and UI integrations.

### Running E2E Tests Locally

1. **Build the Project**
   Before running the tests, you must compile the application code and Electron scripts.
   ```bash
   # From the root of the repository
   npm run build
   ```

2. **Execute the Tests**
   You can run all tests using Turborepo from the root directory:
   ```bash
   npm run test
   ```
   Or run them specifically inside the `apps/editor` directory:
   ```bash
   cd apps/editor
   npm run test
   ```
   *Note: In headless Linux environments (like CI or DevBox), you may need to use `xvfb-run -a npm run test`.*

### Writing New E2E Tests

All E2E tests are located in `apps/editor/e2e/`.

When writing tests, follow these guidelines:

1. **Mocking Native Dialogs**
   Since we don't want to rely on actual OS file pickers during automated tests, we mock the IPC main handlers.
   Example:
   ```typescript
   await electronApp.evaluate(({ ipcMain }) => {
     ipcMain.removeHandler('dialog:openFile');
     ipcMain.handle('dialog:openFile', () => '<svg>...</svg>');
   });
   ```

2. **Interacting with the UI**
   Use standard Playwright locator strategies to ensure the UI updates appropriately after interactions.
   ```typescript
   // Check if a specific layer name appears after import
   await expect(window.locator('text=my-layer')).toBeVisible();
   ```

3. **Verifying the Secure Bridge (Preload Context)**
   You can evaluate scripts in the browser window context to verify that the `electronAPI` is correctly exposed:
   ```typescript
   const apiSurface = await window.evaluate(() => !!(window as any).electronAPI);
   ```
