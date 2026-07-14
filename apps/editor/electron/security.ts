import { app, session } from 'electron';
import { URL } from 'url';

const ALLOWED_EXTERNAL_ORIGINS: string[] = [];

export function setupSecurity() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  // 1. Inject dynamic CSP headers into all window sessions at the main process level
  app.on('ready', () => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // In Dev, allow localhost connections, eval, and inline scripts/styles for Vite HMR
      // In Prod, restrict script execution to local files only (i.e. 'self')
      const csp = isDev
        ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: http:; img-src 'self' data: blob:; font-src 'self' data:;`
        : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:;`;

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });
  });

  // 2. Navigation Guards & Window Creation Guards
  app.on('web-contents-created', (event, contents) => {
    // Navigation guard
    contents.on('will-navigate', (event, navigationUrl) => {
      try {
        const parsedUrl = new URL(navigationUrl);

        const isDevUrl = isDev && process.env.VITE_DEV_SERVER_URL && navigationUrl.startsWith(process.env.VITE_DEV_SERVER_URL);
        const isLocalFile = parsedUrl.protocol === 'file:';

        if (!isDevUrl && !isLocalFile && !ALLOWED_EXTERNAL_ORIGINS.includes(parsedUrl.origin)) {
          console.warn(`[Security] Blocked unauthorized navigation to: ${navigationUrl}`);
          event.preventDefault();
        }
      } catch (err) {
        console.warn(`[Security] Blocked navigation to invalid URL: ${navigationUrl}`);
        event.preventDefault();
      }
    });

    // Window creation guard
    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsedUrl = new URL(url);

        const isDevUrl = isDev && process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
        const isLocalFile = parsedUrl.protocol === 'file:';

        if (!isDevUrl && !isLocalFile && !ALLOWED_EXTERNAL_ORIGINS.includes(parsedUrl.origin)) {
          console.warn(`[Security] Blocked unauthorized window creation for: ${url}`);
          return { action: 'deny' };
        }

        return { action: 'allow' };
      } catch (err) {
        console.warn(`[Security] Blocked window creation for invalid URL: ${url}`);
        return { action: 'deny' };
      }
    });
  });
}
