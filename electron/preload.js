const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  getClipboardImage: () => ipcRenderer.invoke('get-clipboard-image'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onScreenshotSlide: (callback) => ipcRenderer.on('screenshot-slide', () => callback()),
  isElectron: true
});
