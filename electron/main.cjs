const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
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

function getRequestUrl(webContents, details) {
  if (details && typeof details.requestingUrl === 'string' && details.requestingUrl) {
    return details.requestingUrl;
  }

  if (details && typeof details.securityOrigin === 'string' && details.securityOrigin) {
    return details.securityOrigin;
  }

  if (webContents && typeof webContents.getURL === 'function') {
    return webContents.getURL();
  }

  return '';
}

function describeMediaAccess(permission, details) {
  if (permission === 'camera') return 'camera';
  if (permission === 'microphone') return 'microphone';

  const requestedTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
  const hasVideo = requestedTypes.includes('video');
  const hasAudio = requestedTypes.includes('audio');

  if (hasVideo && hasAudio) return 'camera and microphone';
  if (hasVideo) return 'camera';
  if (hasAudio) return 'microphone';
  return 'camera and microphone';
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
  const allowedPermissions = new Set(['media', 'camera', 'microphone', 'fullscreen']);
  const mediaPermissions = new Set(['media', 'camera', 'microphone']);
  const kioskConfig = readKioskConfig();
  const startUrl = getStartUrl(kioskConfig);
  const allowedHosts = getAllowedHosts(kioskConfig, startUrl);
  const cachedMediaDecisions = new Map();

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!allowedPermissions.has(permission)) return false;

    const requestUrl = requestingOrigin || getRequestUrl(webContents, details);
    return isAllowedNavigation(requestUrl, allowedHosts);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    if (!allowedPermissions.has(permission)) return callback(false);

    const requestUrl = getRequestUrl(webContents, details);
    if (!isAllowedNavigation(requestUrl, allowedHosts)) return callback(false);

    if (!mediaPermissions.has(permission)) return callback(true);

    const accessLabel = describeMediaAccess(permission, details);
    const originLabel = (() => {
      try {
        return new URL(requestUrl).origin;
      } catch (_error) {
        return requestUrl || 'this app';
      }
    })();
    const decisionKey = `${originLabel}|${accessLabel}`;
    const cachedDecision = cachedMediaDecisions.get(decisionKey);
    if (typeof cachedDecision === 'boolean') return callback(cachedDecision);

    const ownerWindow =
      BrowserWindow.fromWebContents(webContents) || BrowserWindow.getFocusedWindow() || null;

    dialog
      .showMessageBox(ownerWindow, {
        type: 'question',
        buttons: ['Allow', 'Deny'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: 'Camera Permission',
        message: 'Allow camera access?',
        detail: `${originLabel} wants to use your ${accessLabel}.`,
      })
      .then(({ response }) => {
        const granted = response === 0;
        cachedMediaDecisions.set(decisionKey, granted);
        callback(granted);
      })
      .catch((error) => {
        console.error('Failed to show media permission dialog.', error);
        callback(false);
      });
  });
}

function configureIpcHandlers() {
  ipcMain.on('kiosk:close-app', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.close();
      return;
    }

    app.quit();
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
      preload: path.join(__dirname, 'preload.cjs'),
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
  configureIpcHandlers();
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
