// Ponte segura entre a janela e o sistema.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  versao: () => ipcRenderer.invoke('app:versao'),
  plataforma: process.platform,
  salvarArquivo: (nome, dados) => ipcRenderer.invoke('arquivo:salvar', nome, new Uint8Array(dados)),
  mostrarArquivo: (caminho) => ipcRenderer.invoke('arquivo:mostrar', caminho),
  atualizacao: {
    estado: () => ipcRenderer.invoke('atualizacao:estado'),
    verificar: () => ipcRenderer.invoke('atualizacao:verificar'),
    instalar: () => ipcRenderer.invoke('atualizacao:instalar'),
    aoMudar: (fn) => {
      const ouvinte = (_e, estado) => fn(estado);
      ipcRenderer.on('atualizacao', ouvinte);
      return () => ipcRenderer.removeListener('atualizacao', ouvinte);
    },
  },
});
