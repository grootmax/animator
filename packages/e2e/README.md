# Multi-OS Integrity Platform (E2E)

This package contains automated end-to-end (E2E) tests for validating native shell integration across platforms, particularly focusing on Electron IPC mechanisms like `dialog:openFile` and `dialog:saveFile`.

## Local Development & Testing

You can run these tests locally on any supported operating system (Windows, macOS, Linux).

### Setup
Ensure you have installed dependencies from the monorepo root:
```bash
npm install
npx playwright install --with-deps chromium
```

### Running Tests
To run the E2E tests for the native dialog features:
```bash
npm run test --workspace=@monorepo/e2e
```

### Reporting Dashboard
Playwright generates an interactive HTML reporting dashboard that shows test pass rates, traces, and performance trends.
After running tests, you can view the dashboard locally by running:
```bash
npx playwright show-report playwright-report
```

In CI, the reporting dashboard is automatically uploaded as an artifact on each run. You can download `playwright-report-<os>` from the GitHub Actions run summary to view historical metrics and results.
