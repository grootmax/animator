# Editor E2E Tests

This workspace contains Playwright End-to-End (E2E) tests for the Electron-based Editor application. The primary focus of these tests is to verify the native shell integration and IPC (Inter-Process Communication) features, such as opening and saving files via OS-level dialogs.

## Prerequisites

- Node.js and `npm` installed.
- Ensure the monorepo has been installed (`npm install`).
- Ensure the editor has been built at least once because tests run against the built `dist-electron` and `dist` directories. You can build the whole workspace from the root directory using:
  ```bash
  npm run build
  ```

## Running the Tests

To run the test suite, you can use the command-line interface provided by npm.

From the root of the monorepo:
```bash
# Since Electron requires a display on Linux, prefix with xvfb-run in headless CI environments
xvfb-run npm run test -w @monorepo/editor-e2e
```

From within the `apps/editor-e2e` directory:
```bash
xvfb-run npm run test
```

## Adding New Scenarios

To add new testing scenarios, create or modify test files inside the `tests/` directory (e.g., `tests/editor.spec.ts`).
We use `@playwright/test` to orchestrate Electron tests using `_electron.launch`.

### Mocking Native Dialogs

You can mock native OS dialogs by executing code within the Electron main process using `electronApp.evaluate()`.

Example for Open Dialog (Successful):
```typescript
await electronApp.evaluate(async ({ dialog }, filePath) => {
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [filePath]
  });
}, tempFilePath);
```

Example for Open Dialog (Cancelled):
```typescript
await electronApp.evaluate(async ({ dialog }) => {
  dialog.showOpenDialog = async () => ({
    canceled: true,
    filePaths: []
  });
});
```

Make sure to clean up any temporary files created during the tests!
