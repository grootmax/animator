# Electron IPC & Core Shell

This directory contains the main process logic and preload scripts for the Electron app shell.

## IPC Integrity Suite

We maintain a strict boundary between the renderer (UI) and the main process (Node.js) via the `contextBridge`. The IPC Integrity Suite verifies this boundary and the contract for all native platform handlers (e.g. file dialogs). 

### How to run tests
From the project root:
```bash
npm run test
```

### Adding New IPC Channel Validations
When expanding the shell with new native capabilities, ensure you follow these steps:
1. **Define the secure exposure:** Add the new handler to `apps/editor/electron/preload.ts` via `contextBridge.exposeInMainWorld()`.
2. **Implement the main handler:** Add the corresponding `ipcMain.handle()` inside `apps/editor/electron/main.ts`.
3. **Update the Test Suite:** Open `apps/editor/electron/__tests__/ipc.test.ts`:
   - In the `validates contextBridge isolates renderer from main process` test, verify your new channel is present in the `Object.keys()` assertion and mock the invocation correctly.
   - In the `verifies all IPC channels...` test, extract your new handler from the `handleMock.mock.calls`.
   - Write tests for the success and failure states (e.g., user canceled dialog, filesystem errors) to ensure request/response integrity without a full E2E setup.
