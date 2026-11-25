// Teste de ponta a ponta da Etapa 2 (modelos de checklist e obrigações das empresas).
// Requer: Supabase local (npx supabase start; npx supabase functions serve) e o app em http://localhost:5173 (npx vite).
const { chromium } = require('playwright');
const assert = require('assert');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FOTOS = process.env.FOTOS || null;
const sufixo = Date.now().toString(36);
const GESTOR = { nome: 'Rita Gestora', email: `gestora2.${sufixo}@teste.com`, senha: 'SenhaGestora1' };

let passo = 0;
const ok = (m) => console.log(`ok ${++passo} - ${m}`);
const foto = async (p, n) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${n}.png` }); };
async function escolher(page, rotulo, opcao, escopo = page) {
  await escopo.getByRole('textbox', { name: rotulo, exact: true }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}

let browserGlobal;
(async () => {
  const browser = await chromium.launch();
  browserGlobal = browser;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));

  // Escritório novo
  await page.goto(APP);
  await page.getByRole('link', { name: 'Criar a conta do escritório' }).click();
  await page.getByLabel('Nome do escritório').fill('Escritório Etapa 2');
  await page.getByLabel('Seu nome').fill(GESTOR.nome);
  await page.getByLabel('Seu e-mail').fill(GESTOR.email);
  await page.getByLabel(/^Senha( \*)?$/).fill(GESTOR.senha);
  await page.getByLabel('Repita a senha').fill(GESTOR.senha);
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await page.getByRole('heading', { name: 'Painel' }).waitFor();

  // 1. Modelos prontos
  await page.getByRole('link', { name: 'Modelos de checklist', exact: true }).click();
  await page.getByRole('heading', { name: 'Modelos de checklist' }).waitFor();
  await page.getByText('Apuração e guia do DAS').waitFor();
  const abas = await page.getByRole('tab').allInnerTexts();
  assert.deepStrictEqual(abas.map((t) => t.replace(/\s+/g, ' ').trim()), ['Fiscal 14', 'Contábil 6', 'Departamento Pessoal 6']);
  await page.getByRole('row', { name: /EFD Contribuições/ }).getByText('10º dia útil do 2º mês seguinte').waitFor();
  await foto(page, '20-modelos');
  ok('escritório novo já vem com os modelos prontos, separados por área, com vencimento em português');

  // 2. Editar o DAS: prévia calculada e alteração do dia
  await page.getByRole('row', { name: /Apuração e guia do DAS/ }).getByText('Apuração e guia do DAS').click();
  const m = page.getByRole('dialog', { name: 'Editar item' });
  await m.getByText('Dia 20 do mês seguinte (adia se não for dia útil)').waitFor();
  await m.getByText(/Competência 11\/2026 → vence em/).waitFor();
  const previa = await m.getByText(/Competência 11\/2026 → vence em/).innerText();
  assert.ok(previa.includes('21/12/2026'), 'DAS 11/2026 vence 21/12/2026 (20/12 é domingo): ' + previa);
  await foto(page, '21-modelo-form');
  await m.getByLabel('Dia (31 = último dia)').fill('15');
  await m.getByText('Dia 15 do mês seguinte (adia se não for dia útil)').waitFor();
  await m.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('row', { name: /Apuração e guia do DAS/ }).getByText('Dia 15 do mês seguinte').waitFor();
  ok('editar item mostra a prévia do vencimento (DAS 11/2026 → 21/12/2026) e salva o novo prazo');

  // 3. Criar item anual
  await page.getByRole('button', { name: 'Novo item' }).click();
  const n = page.getByRole('dialog', { name: 'Novo item' });
  await n.getByLabel('Nome do item').fill('Declaração anual de teste');
  await n.getByText('Anual', { exact: true }).click();
  await escolher(page, 'Tipo de prazo', 'Último dia útil', n);
  await escolher(page, 'Mês', 'Abril', n);
  await n.getByText('Lucro Real', { exact: true }).click();
  await n.getByText('Último dia útil de abril do ano seguinte').waitFor();
  await n.getByRole('button', { name: 'Criar item' }).click();
  await page.getByRole('row', { name: /Declaração anual de teste/ }).getByText('Lucro Real · todas as atividades').waitFor();
  ok('gestor cria item anual com regra de aplicação');

  // 4. Desativar item pela chave na lista
  await page.getByRole('row', { name: /DeSTDA/ }).locator('.mantine-Switch-track').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('input[aria-label="Ativar DeSTDA"]');
    return el && !el.checked;
  });
  ok('desativar item direto na lista');

  // 5. Empresa: obrigações automáticas
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  let f = page.getByRole('dialog', { name: 'Nova empresa' });
  await f.getByLabel('Razão social').fill('Loja Exemplo Ltda');
  await f.getByLabel('CNPJ').fill('11444777000161');
  await escolher(page, 'Regime tributário', 'Simples Nacional', f);
  await f.getByText('Comércio', { exact: true }).click();
  await f.getByLabel('Sim').check();
  await f.getByRole('tab', { name: /Obrigações/ }).click();
  for (const item of ['Apuração e guia do DAS', 'DCTFWeb', 'EFD-Reinf', 'DEFIS', 'Conciliação bancária', 'Folha de pagamento', 'FGTS Digital – guia']) {
    assert.ok(await f.getByRole('checkbox', { name: item }).isChecked(), `${item} deveria se aplicar`);
  }
  assert.strictEqual(await f.getByRole('checkbox', { name: 'Apuração do ICMS' }).count(), 0, 'ICMS não aparece (não se aplica ao Simples)');
  assert.strictEqual(await f.getByRole('checkbox', { name: 'DeSTDA' }).count(), 0, 'DeSTDA está desativado');
  ok('nova empresa Simples/comércio com funcionários recebe DAS, DCTFWeb, Reinf, DEFIS, contábeis e DP');

  // Trocar o regime atualiza na hora
  await f.getByRole('tab', { name: /Dados da empresa/ }).click();
  await escolher(page, 'Regime tributário', 'Lucro Presumido', f);
  await f.getByRole('tab', { name: /Obrigações/ }).click();
  assert.ok(await f.getByRole('checkbox', { name: 'Apuração do ICMS' }).isChecked());
  assert.ok(await f.getByRole('checkbox', { name: 'ECD' }).isChecked());
  assert.strictEqual(await f.getByRole('checkbox', { name: 'Apuração e guia do DAS' }).count(), 0);
  ok('trocar o regime para Presumido atualiza as obrigações na hora (entra ICMS e ECD, sai DAS)');
  await f.getByRole('button', { name: 'Cadastrar empresa' }).click();
  await page.getByText('Loja Exemplo Ltda').waitFor();

  // 6. Exceções
  await page.getByText('Loja Exemplo Ltda').click();
  f = page.getByRole('dialog', { name: 'Editar empresa' });
  await f.getByRole('tab', { name: /Obrigações/ }).click();
  await f.getByRole('checkbox', { name: 'Apuração do ICMS' }).uncheck();
  await f.getByText('Retirado').waitFor();
  await f.getByText(/Mostrar \d+ que não se aplicam/).first().click();
  await f.getByRole('checkbox', { name: 'Apuração do ISS' }).check();
  await f.getByText('Acrescentado').waitFor();
  await foto(page, '22-empresa-obrigacoes');
  await page.keyboard.press('Escape');
  await page.getByText('Loja Exemplo Ltda').click();
  f = page.getByRole('dialog', { name: 'Editar empresa' });
  await f.getByRole('tab', { name: /Obrigações/ }).click();
  assert.ok(!(await f.getByRole('checkbox', { name: 'Apuração do ICMS' }).isChecked()));
  assert.ok(await f.getByRole('checkbox', { name: 'Apuração do ISS' }).isChecked());
  ok('exceções por empresa (retirar ICMS, acrescentar ISS) ficam salvas');
  await page.keyboard.press('Escape');

  // 7. Contagem de empresas por item
  await page.getByRole('link', { name: 'Modelos de checklist', exact: true }).click();
  const linhaEcd = page.getByRole('tab', { name: /Contábil/ });
  await linhaEcd.click();
  await page.getByRole('row', { name: /^.*ECD.*1$/ }).waitFor();
  ok('lista de modelos mostra quantas empresas recebem cada item');

  // 8. Restaurar padrão
  await page.getByRole('tab', { name: /Fiscal/ }).click();
  await page.getByRole('row', { name: /DASN-SIMEI/ }).getByText('DASN-SIMEI').click();
  await page.getByRole('button', { name: 'Excluir item' }).click();
  await page.getByRole('dialog', { name: 'Excluir item?' }).getByRole('button', { name: 'Excluir' }).click();
  await page.getByText('Item excluído.').waitFor();
  await page.getByRole('row', { name: /DASN-SIMEI/ }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Restaurar itens padrão' }).click();
  await page.getByRole('dialog', { name: 'Restaurar itens padrão' }).getByRole('button', { name: 'Restaurar' }).click();
  await page.getByText('1 item(ns) recolocado(s).').waitFor();
  await page.getByRole('row', { name: /DASN-SIMEI/ }).waitFor();
  ok('excluir item padrão e restaurar');

  // 9. Usuário fiscal: vê a contagem das suas obrigações e não acessa modelos
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const u = page.getByRole('dialog');
  await u.getByLabel('Nome').fill('Paulo Fiscal');
  await u.getByLabel('E-mail').fill(`paulo.${sufixo}@teste.com`);
  await u.getByLabel('Fiscal').check();
  await u.getByText(/Atende todas as empresas/).click();
  await u.getByRole('button', { name: 'Criar usuário' }).click();
  const acesso = page.getByRole('dialog', { name: 'Acesso criado' });
  await acesso.waitFor();
  const senha = /Senha provisória:\s*(\S+)/.exec(await acesso.innerText())[1];
  const pf = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1 })).newPage();
  await pf.goto(APP);
  await pf.getByLabel('E-mail').fill(`paulo.${sufixo}@teste.com`);
  await pf.getByLabel(/^Senha( \*)?$/).fill(senha);
  await pf.getByRole('button', { name: 'Entrar' }).click();
  await pf.getByLabel(/^Nova senha( \*)?$/).fill('SenhaPaulo123');
  await pf.getByLabel('Repita a nova senha').fill('SenhaPaulo123');
  await pf.getByRole('button', { name: 'Salvar e continuar' }).click();
  await pf.getByRole('link', { name: 'Minhas empresas', exact: true }).click();
  await pf.getByText('Loja Exemplo Ltda').waitFor();
  const cartao = await pf.locator('.mantine-Card-root').first().innerText();
  // Presumido/comércio: DCTFWeb, Reinf, EFD ICMS/IPI, EFD Contribuições, PIS/COFINS, IRPJ/CSLL + ISS (acrescentado) - ICMS (retirado) = 7
  assert.ok(/7 obrigação\(ões\)/.test(cartao), 'fiscal vê 7 obrigações fiscais: ' + cartao);
  await foto(pf, '23-fiscal-obrigacoes');
  await pf.goto(APP + '/#/modelos');
  await pf.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
  ok('usuário fiscal vê quantas obrigações fiscais a empresa tem e não acessa os modelos');

  await browser.close();
  console.log(`\nTODOS OS ${passo} TESTES DE TELA DA ETAPA 2 PASSARAM`);
})().catch(async (e) => {
  console.error('FALHOU:', e.message);
  let i = 0;
  for (const c of browserGlobal?.contexts() ?? []) for (const p of c.pages()) {
    await p.screenshot({ path: `/var/tmp/falha2-${i}.png` }).catch(() => {});
    console.error(`  tela ${i++}: ${p.url()}`);
  }
  process.exit(1);
});
