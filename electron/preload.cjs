const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskBridge', {
  closeApp: () => ipcRenderer.send('kiosk:close-app'),
  isDesktopApp: true,
});
