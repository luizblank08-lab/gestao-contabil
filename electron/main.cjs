// Processo principal do Electron: cria a janela do aplicativo.
const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');

// A identificação do navegador (User-Agent) inclui o nome do app, "Gestão Contábil".
// Acentos nesse cabeçalho chegam ao servidor de login num formato que o banco recusa
// ("Database error granting user"). Por isso, a identificação vai sem acentos.
app.userAgentFallback = app.userAgentFallback
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '');

// Impede abrir duas cópias do app ao mesmo tempo
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Gestão Contábil',
    backgroundColor: '#f6f7f9',
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  janela.once('ready-to-show', () => {
    janela.maximize();
    janela.show();
  });

  // Links externos abrem no navegador, não dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (!(devUrl && url.startsWith(devUrl)) && !url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    janela.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    janela.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

ipcMain.handle('app:versao', () => app.getVersion());

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('br.com.gestaocontabil.app');
  // Menu simples em português (sem o menu padrão em inglês)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu', label: 'Gestão Contábil' }] : []),
      {
        label: 'Editar',
        submenu: [
          { role: 'undo', label: 'Desfazer' },
          { role: 'redo', label: 'Refazer' },
          { type: 'separator' },
          { role: 'cut', label: 'Recortar' },
          { role: 'copy', label: 'Copiar' },
          { role: 'paste', label: 'Colar' },
          { role: 'selectAll', label: 'Selecionar tudo' },
        ],
      },
      {
        label: 'Exibir',
        submenu: [
          { role: 'reload', label: 'Recarregar' },
          { type: 'separator' },
          { role: 'zoomIn', label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+=' },
          { role: 'zoomOut', label: 'Diminuir zoom' },
          { role: 'resetZoom', label: 'Zoom normal' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Tela cheia' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }]),
        ],
      },
    ])
  );
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
