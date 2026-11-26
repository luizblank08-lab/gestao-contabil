// Garante que o programa de computador procura versão nova, avisa a tela e reconhece quando já está em dia.
// Usa um servidor de atualizações falso local (no Windows, o real é o GitHub Releases).
// Uso: npm run build && xvfb-run -a node testes/electron-atualizacao.cjs
const { _electron } = require('playwright');
const http = require('http');
const path = require('path');

function servidor(versao) {
  const s = http.createServer((req, res) => {
    if (req.url.split('?')[0].endsWith('.yml')) {
      res.writeHead(200, { 'Content-Type': 'text/yaml' });
      res.end(`version: ${versao}\nfiles:\n  - url: GestaoContabil-${versao}.AppImage\n    sha512: abc\n    size: 1\npath: GestaoContabil-${versao}.AppImage\nsha512: abc\nreleaseDate: '2026-11-26T00:00:00.000Z'\n`);
    } else { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

async function abrir(url) {
  const app = await _electron.launch({
    executablePath: require('electron'), args: ['--no-sandbox', '.'], cwd: path.join(__dirname, '..'),
    env: { ...process.env, GC_TESTE_ATUALIZACAO: url },
  });
  const w = await app.firstWindow();
  await w.waitForLoadState('domcontentloaded');
  return { app, w };
}

(async () => {
  // 1. Há versão nova: o app detecta e começa a baixar
  const s1 = await servidor('9.9.9');
  let { app, w } = await abrir(`http://127.0.0.1:${s1.address().port}/`);
  const r1 = await w.evaluate(() => window.desktop.atualizacao.verificar());
  // (o download falha de propósito: o servidor falso não tem o arquivo — o app deve voltar a tentar depois)
  await w.waitForFunction(async () => { const e = await window.desktop.atualizacao.estado(); return e.versao === '9.9.9' || e.ultimaVersaoEncontrada === '9.9.9'; }, null, { timeout: 15000 });
  const e1 = await w.evaluate(() => window.desktop.atualizacao.estado());
  await app.close(); s1.close();
  if (r1.versao !== '9.9.9' || r1.estado !== 'baixando') throw new Error('não detectou versão nova: ' + JSON.stringify([r1, e1]));
  if (!['baixando', 'pronta', 'nenhuma'].includes(e1.estado)) throw new Error('falha no download deveria permitir nova tentativa: ' + JSON.stringify(e1));
  console.log('ok - detecta a versão nova (9.9.9), começa a baixar e, se o download falhar, tenta de novo depois');

  // 2. Já está na versão mais recente
  const s2 = await servidor('0.0.1');
  ({ app, w } = await abrir(`http://127.0.0.1:${s2.address().port}/`));
  const e2 = await w.evaluate(() => window.desktop.atualizacao.verificar());
  await app.close(); s2.close();
  if (e2.estado !== 'em_dia') throw new Error('deveria estar em dia: ' + JSON.stringify(e2));
  console.log('ok - reconhece quando já está na versão mais recente');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
