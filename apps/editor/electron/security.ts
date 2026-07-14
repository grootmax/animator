import { session, WebContents } from 'electron';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

export function initializeSecurity() {
  const currentSession = session.defaultSession;

  currentSession.webRequest.onHeadersReceived((details, callback) => {
    try {
      let csp = "default-src 'none'";

      if (isDev) {
        csp = "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* ws://127.0.0.1:*";
      } else {
        csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';";
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    } catch (e) {
      // Fallback: Default deny all
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'none'"],
        },
      });
    }
  });
}

function isSafeNavigation(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    
    if (isDev) {
      const devServerUrl = process.env.VITE_DEV_SERVER_URL;
      if (devServerUrl && urlStr.startsWith(devServerUrl)) {
        return true;
      }
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return true;
      }
    } else {
      if (url.protocol === 'file:') {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

export function setupNavigationGuards(webContents: WebContents) {
  webContents.on('will-navigate', (event, url) => {
    if (!isSafeNavigation(url)) {
      event.preventDefault();
      console.warn(`Blocked external navigation to: ${url}`);
    }
  });

  webContents.on('will-redirect', (event, url) => {
    if (!isSafeNavigation(url)) {
      event.preventDefault();
      console.warn(`Blocked external redirect to: ${url}`);
    }
  });
}

export function setupWindowOpenHandler(webContents: WebContents) {
  webContents.setWindowOpenHandler((details) => {
    console.warn(`Blocked attempt to open new window: ${details.url}`);
    return { action: 'deny' };
  });
}
