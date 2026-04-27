const { app, BrowserWindow, Menu, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DEV_URL = 'http://localhost:5173';
const DEFAULT_REMOTE_URL = 'https://photobooth.izzul.xyz';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function readKioskConfig() {
  const candidates = [
    path.join(process.cwd(), 'electron', 'kiosk.config.json'),
    path.join(app.getAppPath(), 'electron', 'kiosk.config.json'),
  ];

  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.error('Failed to parse kiosk config at', configPath, error);
    }
  }

  return {};
}

function normalizeHost(urlString) {
  try {
    return new URL(urlString).host.toLowerCase();
  } catch (_error) {
    return null;
  }
}

function getStartUrl(config) {
  if (process.env.ELECTRON_START_URL) return process.env.ELECTRON_START_URL;
  if (process.env.KIOSK_START_URL) return process.env.KIOSK_START_URL;
  if (typeof config.startUrl === 'string' && config.startUrl.trim()) return config.startUrl.trim();
  if (app.isPackaged) return DEFAULT_REMOTE_URL;
  return DEV_URL;
}

function getAllowedHosts(config, startUrl) {
  const hostSet = new Set();
  const startHost = normalizeHost(startUrl);

  if (startHost) hostSet.add(startHost);
  if (Array.isArray(config.allowNavigationHosts)) {
    for (const host of config.allowNavigationHosts) {
      if (typeof host === 'string' && host.trim()) {
        hostSet.add(host.trim().toLowerCase());
      }
    }
  }

  if (!app.isPackaged) hostSet.add('localhost:5173');
  return hostSet;
}

function isAllowedNavigation(urlString, allowedHosts) {
  if (!urlString) return false;
  if (urlString === 'about:blank') return true;

  try {
    const url = new URL(urlString);
    if (url.protocol === 'file:') return true;
    return allowedHosts.has(url.host.toLowerCase());
  } catch (_error) {
    return false;
  }
}

function shouldBlockShortcut(input) {
  const key = (input.key || '').toLowerCase();
  const ctrlOrMeta = input.control || input.meta;

  if (key === 'f11') return true;
  if (input.alt && key === 'f4') return true;
  if (ctrlOrMeta && (key === 'r' || key === 'w')) return true;
  if (ctrlOrMeta && input.shift && key === 'i') return true;
  if (key === 'browserback' || key === 'browserforward') return true;

  return false;
}

function configurePermissions() {
  const allowed = new Set(['media', 'camera', 'microphone', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission));
  });
}

async function createMainWindow() {
  const kioskConfig = readKioskConfig();
  const startUrl = getStartUrl(kioskConfig);
  const allowedHosts = getAllowedHosts(kioskConfig, startUrl);

  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    frame: false,
    fullscreen: true,
    kiosk: app.isPackaged,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url, allowedHosts)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url, allowedHosts)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!shouldBlockShortcut(input)) return;
    event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setFullScreen(true);
    if (app.isPackaged) mainWindow.setKiosk(true);
  });

  try {
    await mainWindow.loadURL(startUrl);
  } catch (error) {
    console.error('Failed to load start URL, trying local dist fallback.', error);
    const localIndexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    await mainWindow.loadFile(localIndexPath);
  }

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configurePermissions();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
