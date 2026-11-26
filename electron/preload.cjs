// Ponte segura entre a janela e o sistema.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  versao: () => ipcRenderer.invoke('app:versao'),
  plataforma: process.platform,
  salvarArquivo: (nome, dados) => ipcRenderer.invoke('arquivo:salvar', nome, new Uint8Array(dados)),
  mostrarArquivo: (caminho) => ipcRenderer.invoke('arquivo:mostrar', caminho),
});
