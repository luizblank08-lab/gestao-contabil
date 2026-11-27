// Teste de ponta a ponta da revisão do Gestor: devolver tarefa para correção.
// Requer: Supabase local (npx supabase start; npx supabase functions serve) e o app (npx vite).
const { chromium } = require('playwright');
const assert = require('assert');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FOTOS = process.env.FOTOS || null;
const sufixo = Date.now().toString(36);
let passo = 0;
const ok = (m) => console.log(`ok ${++passo} - ${m}`);
const foto = async (p, n) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${n}.png` }); };
const contexto = (b) => b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1 });
async function escolher(page, rotulo, opcao, escopo = page) {
  await escopo.getByRole('textbox', { name: rotulo, exact: true }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}
const linha = (page, obrigacao) => page.locator('tr', { hasText: 'Gama Comércio' }).filter({ hasText: obrigacao }).first();
const MOTIVO = 'Faltou anexar o comprovante de pagamento da guia';

let browserGlobal;
(async () => {
  const browser = await chromium.launch();
  browserGlobal = browser;
  const page = await (await contexto(browser)).newPage();
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));

  // Preparação
  await page.goto(APP);
  await page.getByRole('link', { name: 'Criar a conta do escritório' }).click();
  await page.getByLabel('Nome do escritório').fill('Escritório Revisão');
  await page.getByLabel('Seu nome').fill('Rosa Gestora');
  await page.getByLabel('Seu e-mail').fill(`gestora.rev.${sufixo}@teste.com`);
  await page.getByLabel(/^Senha( \*)?$/).fill('SenhaGestora1');
  await page.getByLabel('Repita a senha').fill('SenhaGestora1');
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await page.getByRole('heading', { name: 'Painel' }).waitFor();
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const u = page.getByRole('dialog');
  await u.getByLabel('Nome').fill('Bia Fiscal');
  await u.getByLabel('E-mail').fill(`bia.${sufixo}@teste.com`);
  await u.getByLabel('Fiscal').check();
  await u.getByRole('button', { name: 'Criar usuário' }).click();
  const acesso = page.getByRole('dialog', { name: 'Acesso criado' });
  await acesso.waitFor();
  const senha = /Senha provisória:\s*(\S+)/.exec(await acesso.innerText())[1];
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  const f = page.getByRole('dialog', { name: 'Nova empresa' });
  await f.getByLabel('Código').fill('301');
  await f.getByLabel('Razão social').fill('Gama Comércio Ltda');
  await escolher(page, 'Regime tributário', 'Simples Nacional', f);
  await f.getByText('Comércio', { exact: true }).click();
  await escolher(page, 'Responsável Fiscal', 'Bia Fiscal', f);
  await f.getByRole('button', { name: 'Cadastrar empresa' }).click();
  await page.getByText('Gama Comércio Ltda').waitFor();
  await page.getByRole('link', { name: 'Checklists do mês', exact: true }).click();
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '11/2026', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar / atualizar' }).click();
  await linha(page, 'Apuração e guia do DAS').waitFor();
  ok('preparação: gestora, usuária fiscal, empresa e checklists de 11/2026');

  // 1. Bia marca o DAS como feito
  const pb = await (await contexto(browser)).newPage();
  await pb.goto(APP);
  await pb.getByLabel('E-mail').fill(`bia.${sufixo}@teste.com`);
  await pb.getByLabel(/^Senha( \*)?$/).fill(senha);
  await pb.getByRole('button', { name: 'Entrar' }).click();
  await pb.getByLabel(/^Nova senha( \*)?$/).fill('SenhaBia12345');
  await pb.getByLabel('Repita a nova senha').fill('SenhaBia12345');
  await pb.getByRole('button', { name: 'Salvar e continuar' }).click();
  await pb.getByRole('textbox', { name: 'Competência' }).click();
  await pb.getByRole('option', { name: '11/2026', exact: true }).click();
  await pb.getByRole('tab', { name: /^Pendentes/ }).click();
  await linha(pb, 'Apuração e guia do DAS').getByRole('checkbox').click();
  await linha(page, 'Apuração e guia do DAS').getByText('Feita', { exact: true }).waitFor({ timeout: 15000 });
  ok('responsável marca o DAS como feito e a gestora vê na hora');

  // 2. Gestora revisa e devolve
  await linha(page, 'Apuração e guia do DAS').getByText('Apuração e guia do DAS').click();
  const g = page.getByRole('dialog', { name: 'Tarefa' });
  await g.getByRole('button', { name: 'Devolver para correção' }).click();
  const d = page.getByRole('dialog', { name: 'Devolver para correção' });
  assert.ok(await d.getByRole('button', { name: 'Devolver' }).isDisabled(), 'precisa escrever o motivo');
  await d.getByLabel('O que precisa ser corrigido?').fill(MOTIVO);
  await foto(page, '50-devolver');
  await d.getByRole('button', { name: 'Devolver' }).click();
  await page.getByText('Tarefa devolvida para Bia Fiscal.').waitFor();
  await g.getByText('Devolvida para correção', { exact: true }).waitFor();
  await g.getByText(/devolveu para correção: "Faltou anexar/).waitFor();
  await page.keyboard.press('Escape');
  await linha(page, 'Apuração e guia do DAS').getByText('Devolvida p/ correção').waitFor();
  ok('gestora devolve com observação; a tarefa volta a pendente como "Devolvida" e o histórico registra');

  // 3. Bia vê em destaque, sem recarregar
  await pb.getByText('1 tarefa(s) devolvida(s) pelo Gestor para correção').waitFor({ timeout: 15000 });
  await pb.getByRole('tab', { name: 'Devolvidas (1)' }).click();
  await linha(pb, 'Apuração e guia do DAS').getByText(`↩ ${MOTIVO}`).waitFor();
  await foto(pb, '51-devolvida-usuaria');
  await linha(pb, 'Apuração e guia do DAS').getByText('Apuração e guia do DAS').click();
  const gb = pb.getByRole('dialog', { name: 'Tarefa' });
  await gb.getByText(MOTIVO, { exact: true }).waitFor();
  assert.strictEqual(await gb.getByRole('button', { name: 'Devolver para correção' }).count(), 0, 'usuária não vê o botão de devolver');
  await foto(pb, '52-tarefa-devolvida');
  ok('responsável vê o aviso, a aba "Devolvidas" e o motivo — sem precisar recarregar');

  // 4. Bia corrige e marca como feita de novo
  await gb.getByTestId('anexar-arquivo').setInputFiles({ name: 'comprovante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF comprovante') });
  await gb.getByText('comprovante.pdf', { exact: true }).waitFor();
  await gb.getByText('✓ Feita', { exact: true }).click();
  await gb.getByText('Devolvida para correção', { exact: true }).waitFor({ state: 'detached' });
  await pb.keyboard.press('Escape');
  await pb.getByText(/devolvida\(s\) pelo Gestor/).waitFor({ state: 'detached' });
  await linha(page, 'Apuração e guia do DAS').getByText('Feita', { exact: true }).waitFor({ timeout: 15000 });
  ok('responsável corrige e conclui de novo: some o destaque e a gestora vê "Feita"');

  // 5. Painel conta devolvidas
  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '11/2026', exact: true }).click();
  await page.getByLabel('Devolvidas p/ correção: 0').waitFor();
  ok('painel tem o bloco "Devolvidas p/ correção"');

  await browser.close();
  console.log(`\nTODOS OS ${passo} TESTES DE TELA DA REVISÃO PASSARAM`);
})().catch(async (e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 6).join(' | '));
  let i = 0;
  for (const c of browserGlobal?.contexts() ?? []) for (const p of c.pages()) {
    await p.screenshot({ path: `/var/tmp/falha-rev-${i}.png` }).catch(() => {});
    console.error(`  tela ${i++}: ${p.url()}`);
  }
  process.exit(1);
});
