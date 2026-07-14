import { app, session, shell, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function setupSecurity() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const userDataPath = app.getPath('userData');
  const logPath = path.join(userDataPath, 'security_audit.log');

  function logSecurityEvent(type: string, url: string, details: any = {}) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = JSON.stringify({
        timestamp,
        type,
        url,
        details
      }) + '\n';
      fs.appendFileSync(logPath, logEntry, 'utf-8');
    } catch (e) {
      console.error('Failed to write security log:', e);
    }
  }

  app.on('ready', () => {
    // 1. Environment-Aware CSP
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      let csp = '';
      
      if (isDev) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL!);
        csp = `default-src 'self'; ` +
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'; ` +
              `style-src 'self' 'unsafe-inline'; ` +
              `connect-src 'self' http://${devUrl.host} ws://${devUrl.host} http://localhost:* ws://localhost:*; ` +
              `img-src 'self' data: blob:; ` +
              `font-src 'self' data:;`;
      } else {
        csp = `default-src 'self'; ` +
              `script-src 'self'; ` +
              `style-src 'self' 'unsafe-inline'; ` +
              `connect-src 'self'; ` +
              `img-src 'self' data: blob:; ` +
              `font-src 'self' data:; ` +
              `object-src 'none'; ` +
              `base-uri 'none'; ` +
              `form-action 'none';`;
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      });
    });
  });

  // 2. Navigation & Window Open Guards
  app.on('web-contents-created', (event, webContents: WebContents) => {
    const isAllowedOrigin = (targetUrl: string) => {
      try {
        const parsedUrl = new URL(targetUrl);
        if (parsedUrl.protocol === 'file:') return true;
        if (parsedUrl.protocol === 'devtools:') return true;
        if (isDev && process.env.VITE_DEV_SERVER_URL) {
          const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
          if (parsedUrl.origin === devUrl.origin) return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    webContents.on('will-navigate', (event, navigationUrl) => {
      if (!isAllowedOrigin(navigationUrl)) {
        event.preventDefault();
        logSecurityEvent('BLOCKED_NAVIGATION', navigationUrl, { reason: 'Domain not whitelisted' });
        
        if (navigationUrl.startsWith('http://') || navigationUrl.startsWith('https://')) {
          shell.openExternal(navigationUrl);
        }
      }
    });

    webContents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedOrigin(url)) {
        logSecurityEvent('BLOCKED_WINDOW_OPEN', url, { reason: 'Domain not whitelisted' });
        
        if (url.startsWith('http://') || url.startsWith('https://')) {
          shell.openExternal(url);
        }
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // 3. Catch CSP violations and log them
    webContents.on('console-message', (event, level, message, line, sourceId) => {
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('content security policy') || lowerMessage.includes('csp')) {
        // Attempt to extract blocked URL if present
        let blockedUrl = 'unknown';
        const urlMatch = message.match(/to '([^']+)'/);
        if (urlMatch && urlMatch[1]) {
          blockedUrl = urlMatch[1];
        }
        logSecurityEvent('CSP_VIOLATION', blockedUrl, { message, line, sourceId });
      }
    });
  });
}
