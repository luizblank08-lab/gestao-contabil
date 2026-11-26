// Teste de ponta a ponta do histórico de importações com "Desfazer".
// Cenário: importa a planilha certa, corrige uma empresa à mão, importa uma planilha errada e desfaz.
// Requer: Supabase local (npx supabase start; npx supabase functions serve) e o app (npx vite).
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FOTOS = process.env.FOTOS || null;
const sufixo = Date.now().toString(36);
let passo = 0;
const ok = (m) => console.log(`ok ${++passo} - ${m}`);
const foto = async (p, n) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${n}.png` }); };

async function importar(page, arquivo, esperado) {
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  await page.getByTestId('arquivo-planilha').setInputFiles(path.join(__dirname, 'arquivos', arquivo));
  const imp = page.getByRole('dialog', { name: 'Importar empresas de uma planilha' });
  await imp.getByRole('button', { name: /^Importar \d+ empresa/ }).click();
  await page.getByText(esperado).waitFor();
  await imp.waitFor({ state: 'detached' });
}

let browserGlobal;
(async () => {
  const browser = await chromium.launch();
  browserGlobal = browser;
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1 })).newPage();
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));

  await page.goto(APP);
  await page.getByRole('link', { name: 'Criar a conta do escritório' }).click();
  await page.getByLabel('Nome do escritório').fill('Escritório Importações');
  await page.getByLabel('Seu nome').fill('Marina Gestora');
  await page.getByLabel('Seu e-mail').fill(`gestora.imp.${sufixo}@teste.com`);
  await page.getByLabel(/^Senha( \*)?$/).fill('SenhaGestora1');
  await page.getByLabel('Repita a senha').fill('SenhaGestora1');
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await page.getByRole('heading', { name: 'Painel' }).waitFor();
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();

  // 1. Planilha certa (4 empresas)
  await importar(page, 'planilha-exemplo.xlsx', '4 empresa(s) nova(s) e 0 atualizada(s)');
  await page.getByText('DELTA SEM REGIME').waitFor();
  ok('importa a planilha certa (4 empresas)');

  // 2. Correção manual na DELTA (que a planilha errada não toca) e na BETA (que ela também não toca)
  await page.getByText('DELTA SEM REGIME').click();
  const f = page.getByRole('dialog', { name: 'Editar empresa' });
  await f.getByLabel('Razão social').fill('DELTA CORRIGIDA À MÃO LTDA');
  await f.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByText('DELTA CORRIGIDA À MÃO LTDA').waitFor();

  // 3. Planilha errada: troca o nome da 501 e cria 901 e 902
  await importar(page, 'planilha-errada.xlsx', '2 empresa(s) nova(s) e 1 atualizada(s)');
  await page.getByText('NOME TROCADO POR ENGANO LTDA').waitFor();
  await page.getByText('EMPRESA QUE NAO DEVIA EXISTIR LTDA').waitFor();
  ok('importa a planilha errada (cria 2 e troca o nome de 1)');

  // 4. Histórico
  await page.getByRole('button', { name: 'Histórico de importações' }).click();
  const h = page.getByRole('dialog', { name: 'Histórico de importações' });
  await h.getByText('planilha-errada.xlsx').waitFor();
  await h.getByText('planilha-exemplo.xlsx').waitFor();
  assert.strictEqual(await h.getByRole('button', { name: 'Desfazer' }).count(), 1, 'só a mais recente pode ser desfeita');
  assert.ok(await h.getByRole('row', { name: /planilha-errada/ }).getByRole('button', { name: 'Desfazer' }).isVisible());
  await foto(page, '40-historico');
  ok('histórico mostra as duas importações, com "Desfazer" só na mais recente');

  // 5. Desfazer
  await h.getByRole('row', { name: /planilha-errada/ }).getByRole('button', { name: 'Desfazer' }).click();
  await page.getByRole('dialog', { name: 'Desfazer importação?' }).getByText('serão', { exact: false }).first().waitFor();
  await page.getByRole('dialog', { name: 'Desfazer importação?' }).getByRole('button', { name: 'Desfazer importação' }).click();
  await page.getByText('Importação desfeita: 2 empresa(s) excluída(s), 1 restaurada(s).').waitFor();
  await h.getByRole('row', { name: /planilha-errada/ }).getByText('Desfeita').waitFor();
  assert.ok(await h.getByRole('row', { name: /planilha-exemplo/ }).getByRole('button', { name: 'Desfazer' }).isVisible(), 'agora a anterior pode ser desfeita');
  await foto(page, '41-historico-desfeito');
  await h.getByRole('button', { name: 'Fechar' }).click();
  ok('desfaz a planilha errada; a anterior passa a poder ser desfeita');

  // 6. Cadastro voltou ao que era
  await page.getByText('EMPRESA QUE NAO DEVIA EXISTIR LTDA').waitFor({ state: 'detached' });
  assert.strictEqual(await page.getByText('OUTRA EMPRESA ERRADA ME').count(), 0);
  assert.strictEqual(await page.getByText('NOME TROCADO POR ENGANO LTDA').count(), 0);
  await page.getByText('ALFA COMERCIO DE TESTE LTDA').waitFor();
  await page.getByText('DELTA CORRIGIDA À MÃO LTDA').waitFor();
  await page.getByText('4 ativa(s) · 4 no total').waitFor();
  ok('empresas criadas por engano somem, nome original volta e a correção manual é mantida');

  await browser.close();
  console.log(`\nTODOS OS ${passo} TESTES DE TELA DO HISTÓRICO DE IMPORTAÇÕES PASSARAM`);
})().catch(async (e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 6).join(' | '));
  let i = 0;
  for (const c of browserGlobal?.contexts() ?? []) for (const p of c.pages()) {
    await p.screenshot({ path: `/var/tmp/falha-imp-${i}.png` }).catch(() => {});
    console.error(`  tela ${i++}: ${p.url()}`);
  }
  process.exit(1);
});
