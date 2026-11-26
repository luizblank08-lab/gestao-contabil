// Garante que, no programa de computador, "Baixar anexo" abre "Salvar como" com o nome original
// (inclusive com acentos e travessão) e grava o arquivo.
// Uso: npm run build && xvfb-run -a node testes/electron-salvar-anexo.cjs
const { _electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-salvar-'));
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', '.'], cwd: path.join(__dirname, '..') });
  // Simula a pessoa escolhendo a pasta na janela "Salvar como" e guarda o nome sugerido
  await app.evaluate(({ dialog }, destino) => {
    dialog.showSaveDialog = async (_janela, opcoes) => {
      global.__sugerido = opcoes.defaultPath;
      const nome = opcoes.defaultPath.split(/[\\/]/).pop();
      return { canceled: false, filePath: `${destino}/${nome}` };
    };
  }, pasta);
  const w = await app.firstWindow();
  await w.waitForLoadState('domcontentloaded');
  const nome = 'Recibo de férias – Novembro.pdf';
  const salvo = await w.evaluate((n) => window.desktop.salvarArquivo(n, new TextEncoder().encode('conteúdo do recibo').buffer), nome);
  const sugerido = await app.evaluate(() => global.__sugerido);
  const downloads = await app.evaluate(({ app: a }) => a.getPath('downloads'));
  await app.close();
  if (path.basename(sugerido) !== nome) throw new Error('Nome sugerido errado: ' + sugerido);
  if (path.dirname(sugerido) !== downloads) throw new Error('Pasta sugerida não é a de downloads do sistema: ' + sugerido);
  if (fs.readFileSync(salvo, 'utf8') !== 'conteúdo do recibo') throw new Error('Conteúdo não confere');
  console.log('ok - "Salvar como" sugere', JSON.stringify(path.basename(sugerido)), 'na pasta de downloads do sistema e grava o arquivo');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
