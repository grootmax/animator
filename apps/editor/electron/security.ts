import { app } from 'electron';
import { URL } from 'url';

const ALLOWED_EXTERNAL_ORIGINS: string[] = [];

export function setupSecurity() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  // 1. Inject dynamic CSP headers into all window sessions at the main process level
  app.on('session-created', (sess) => {
    sess.webRequest.onHeadersReceived((details, callback) => {
      const devUrl = isDev && process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL).origin : '';
      const csp = isDev
        ? `default-src 'self' ${devUrl}; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devUrl}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://fonts.gstatic.com ${devUrl}; connect-src 'self' ws: wss: http: ${devUrl};`
        : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; connect-src 'self';`;

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });
  });

  // 2. Navigation Guards & Window Creation Guards
  app.on('web-contents-created', (_event, contents) => {
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

    // Redirect guard
    contents.on('will-redirect', (event, redirectUrl) => {
      try {
        const parsedUrl = new URL(redirectUrl);

        const isDevUrl = isDev && process.env.VITE_DEV_SERVER_URL && redirectUrl.startsWith(process.env.VITE_DEV_SERVER_URL);
        const isLocalFile = parsedUrl.protocol === 'file:';

        if (!isDevUrl && !isLocalFile && !ALLOWED_EXTERNAL_ORIGINS.includes(parsedUrl.origin)) {
          console.warn(`[Security] Blocked unauthorized redirect to: ${redirectUrl}`);
          event.preventDefault();
        }
      } catch (err) {
        console.warn(`[Security] Blocked redirect to invalid URL: ${redirectUrl}`);
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

    // Webview attachment guard
    contents.on('will-attach-webview', (event) => {
      console.warn('[Security] Blocked webview attachment');
      event.preventDefault();
    });
  });
}
