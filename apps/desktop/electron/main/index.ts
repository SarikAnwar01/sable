import { app, BrowserWindow, protocol, session, type Session } from 'electron';
import { join } from 'node:path';
import { IPC, PERSIST_PARTITION, PRIVATE_PARTITION } from '@shared';
import { TabManager } from './tabs/TabManager';
import { AdBlocker } from './adblock/AdBlocker';
import { Storage } from './storage/Storage';
import { trackDownload } from './storage/downloads';
import { AppSettings } from './settings/AppSettings';
import { registerIpc } from './ipc/registerIpc';
import { buildMenu } from './menu';
import { newtabHtml } from './newtab';

app.setName('Sable');

// The privileged `sable://` scheme powers internal pages (new tab, and later
// settings/history). Must be declared before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sable',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tabs: TabManager | null = null;
let adblocker: AdBlocker | null = null;
let storage: Storage | null = null;
let appSettings: AppSettings | null = null;

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Install the `sable://` handler on a session. `protocol.handle` is per-session,
 * so this must run for every session our tabs use — not just the default one.
 */
function installSableProtocol(sess: Session): void {
  sess.protocol.handle('sable', (request) => {
    try {
      const { host } = new URL(request.url);
      if (host === 'newtab') {
        // Rendered per-request so a search-engine change applies immediately.
        return new Response(newtabHtml(appSettings?.searchEngine ?? 'google'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      });
    } catch (err) {
      console.error('[sable] protocol handler error:', err);
      return new Response('Internal error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      });
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 680,
    minHeight: 480,
    show: false,
    backgroundColor: '#0b0b0f',
    icon: join(app.getAppPath(), 'build', 'icon.png'), // used on Windows/Linux
    // Frameless-ish on macOS: keep traffic lights, drop the title bar so the
    // sidebar can own the top-left corner (Arc-style).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  tabs = new TabManager(mainWindow, storage, () => appSettings);

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // Load the React chrome UI (dev server in dev, built file in prod).
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open the first tab once the chrome has painted. Guard so reloading the
  // chrome (e.g. HMR) never spawns duplicate tabs.
  let bootstrapped = false;
  mainWindow.webContents.on('did-finish-load', () => {
    if (bootstrapped) return;
    bootstrapped = true;
    tabs?.createTab({});
  });

  mainWindow.on('closed', () => {
    tabs?.dispose();
    tabs = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // In dev the dock shows the generic Electron icon; force the Sable ✳ mark.
  // (Packaged builds get it from the .icns bundled by electron-builder.)
  if (process.platform === 'darwin' && !app.isPackaged) {
    try {
      app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'));
    } catch {
      /* best-effort dev-only dock icon */
    }
  }

  try {
    storage = new Storage();
  } catch (err) {
    console.error('[sable] storage init failed:', err);
  }
  appSettings = new AppSettings(storage);

  installSableProtocol(session.defaultSession);
  installSableProtocol(session.fromPartition(PERSIST_PARTITION));
  installSableProtocol(session.fromPartition(PRIVATE_PARTITION));

  const persistSession = session.fromPartition(PERSIST_PARTITION);

  if (storage) {
    adblocker = new AdBlocker(
      (stats) => sendToRenderer(IPC.AdblockStats, stats),
      (webContentsId, count) => tabs?.recordBlocked(webContentsId, count),
      storage,
    );
    // Restore the saved on/off preference before wiring the sessions.
    if (!appSettings.all.adblockEnabled) adblocker.setEnabled(false);
    // Install blocking up front; requests pass through until the engine loads.
    adblocker.enableForSession(persistSession);
    adblocker.enableForSession(session.fromPartition(PRIVATE_PARTITION));

    // Capture downloads from normal tabs (private downloads aren't recorded).
    persistSession.on('will-download', (_e, item) =>
      trackDownload(item, storage!, (entry) => sendToRenderer(IPC.DownloadUpdated, entry)),
    );
  }

  registerIpc(
    () => tabs,
    () => adblocker,
    () => storage,
    () => appSettings,
  );
  buildMenu(() => tabs);
  createWindow();

  // Load blocklists after the window is up so startup isn't gated on the network.
  adblocker?.init().catch((err) => console.error('[sable] adblock init failed:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
