const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, globalShortcut, nativeImage, clipboard, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const PORT = 3000;

const isPacked = app.isPackaged;
const appDir = path.resolve(__dirname, '..');
const iconPath = path.join(appDir, 'public', 'assets', 'app-icon.png');
const icoPath = path.join(appDir, 'public', 'assets', 'app-icon.ico');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 860,
    minWidth: 900, minHeight: 600,
    icon: fs.existsSync(icoPath) ? icoPath : iconPath,
    title: '智慧课堂',
    backgroundColor: '#f8f6f3',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0')) {
      event.preventDefault();
    }
  });
  mainWindow.on('close', () => {
    app.isQuitting = true;
    app.quit();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  if (!fs.existsSync(iconPath)) return;
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('智慧课堂');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    function check(n) {
      if (n <= 0) return reject(new Error('timeout'));
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(() => check(n - 1), 500);
      });
      req.on('error', () => setTimeout(() => check(n - 1), 500));
      req.end();
    }
    check(retries);
  });
}

function startServer() {
  return new Promise((resolve) => {
    const envFile = path.join(appDir, '.env');
    const envDefault = path.join(appDir, '.env.default');
    if (!fs.existsSync(envFile) && fs.existsSync(envDefault)) fs.copyFileSync(envDefault, envFile);

    const serverScript = path.join(appDir, 'src', 'server.js');
    const nodeExe = isPacked ? process.execPath : 'node';
    const env = {
      ...process.env,
      ELECTRON: '1',
      AUTO_OPEN_DASHBOARD: 'false'
    };
    if (isPacked) env.ELECTRON_RUN_AS_NODE = '1';

    serverProcess = spawn(nodeExe, [serverScript], {
      cwd: appDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    serverProcess.stdout.on('data', (d) => console.log('[srv]', d.toString().trim()));
    serverProcess.stderr.on('data', (d) => console.error('[srv]', d.toString().trim()));
    serverProcess.on('error', (e) => { console.error('spawn error:', e); resolve(); });
    serverProcess.on('exit', (code) => console.log('[srv] exit', code));
    waitForServer().then(resolve).catch(() => resolve());
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow) mainWindow.webContents.send('screenshot-slide');
  });
});

app.on('activate', () => { if (!mainWindow) createWindow(); else mainWindow.show(); });
app.on('before-quit', () => { app.isQuitting = true; if (serverProcess && !serverProcess.killed) serverProcess.kill(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { app.quit(); });

ipcMain.handle('select-file', async (_, opts) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: opts?.filters || [{ name: 'Documents', extensions: ['pdf','png','jpg','jpeg','webp','gif'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('read-file', (_, filePath) => {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.pdf':'application/pdf', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif' };
  return { buffer: buffer.toString('base64'), mime: mime[ext] || 'application/octet-stream', name: path.basename(filePath) };
});

ipcMain.handle('get-clipboard-image', () => {
  const img = clipboard.readImage();
  return img.isEmpty() ? null : img.toDataURL();
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
