// Garante que o programa de computador se identifica ao servidor sem acentos.
// (Com acentos, o login falha com "Database error granting user".)
// Uso: xvfb-run -a node testes/electron-identificacao.cjs   (no Windows/Mac: node testes/electron-identificacao.cjs)
const { _electron } = require('playwright');
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', '.'], cwd: require('path').join(__dirname, '..') });
  const w = await app.firstWindow();
  await w.waitForLoadState('domcontentloaded');
  const ua = await w.evaluate(() => navigator.userAgent);
  await app.close();
  if (!/^[\x20-\x7E]+$/.test(ua)) throw new Error('Identificação com caracteres especiais: ' + ua);
  console.log('ok - identificação sem acentos:', ua);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
