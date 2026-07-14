import { app, session, shell, WebContents } from 'electron';

// Allow-list for external navigation
const ALLOWED_EXTERNAL_DOMAINS = new Set([
  'github.com',
  'www.github.com'
]);

export function setupSecurity() {
  app.on('web-contents-created', (_, contents: WebContents) => {
    
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      
      if (parsedUrl.protocol === 'devtools:') {
        return;
      }

      const isDev = !!process.env.VITE_DEV_SERVER_URL;
      if (isDev) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL!);
        if (parsedUrl.origin === devUrl.origin) {
          return;
        }
      } else {
        if (parsedUrl.protocol === 'file:') {
          return;
        }
      }

      event.preventDefault();

      if (ALLOWED_EXTERNAL_DOMAINS.has(parsedUrl.hostname)) {
        shell.openExternal(navigationUrl).catch(console.error);
      }
    });

    contents.setWindowOpenHandler((details) => {
      const parsedUrl = new URL(details.url);

      if (ALLOWED_EXTERNAL_DOMAINS.has(parsedUrl.hostname)) {
        shell.openExternal(details.url).catch(console.error);
      }

      return { action: 'deny' };
    });
  });
}

export function setupCSP() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let csp = "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: http: https:; style-src 'self' 'unsafe-inline'; img-src 'self' data:;";
    
    // In production, we might want a stricter CSP, but to avoid breaking Vite's build
    // we use a generally safe but functional CSP.
    if (!isDev) {
       csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';";
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });
}
