// Ponte segura entre a janela e o sistema.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  versao: () => ipcRenderer.invoke('app:versao'),
  plataforma: process.platform,
});
