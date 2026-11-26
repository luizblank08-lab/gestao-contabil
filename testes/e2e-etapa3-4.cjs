// Teste de ponta a ponta das Etapas 3 e 4: checklists do mês, tarefa (situação, observação, anexos,
// histórico), tempo real, permissões por área e painéis.
// Requer: Supabase local com armazenamento (npx supabase start; npx supabase functions serve) e o app (npx vite).
const { chromium } = require('playwright');
const assert = require('assert');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FOTOS = process.env.FOTOS || null;
const sufixo = Date.now().toString(36);
const GESTOR = { nome: 'Helena Gestora', email: `gestora3.${sufixo}@teste.com`, senha: 'SenhaGestora1' };

let passo = 0;
const ok = (m) => console.log(`ok ${++passo} - ${m}`);
const foto = async (p, n) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${n}.png` }); };
const contexto = (b) => b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1, acceptDownloads: true });
async function escolher(page, rotulo, opcao, escopo = page) {
  await escopo.getByRole('textbox', { name: rotulo, exact: true }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}
async function entrarPrimeiroAcesso(page, email, senha, nova) {
  await page.goto(APP);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel(/^Senha( \*)?$/).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByLabel(/^Nova senha( \*)?$/).fill(nova);
  await page.getByLabel('Repita a nova senha').fill(nova);
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();
  await page.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
}
async function criarUsuario(page, nome, email, area) {
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const u = page.getByRole('dialog');
  await u.getByLabel('Nome').fill(nome);
  await u.getByLabel('E-mail').fill(email);
  await u.getByLabel(area).check();
  await u.getByRole('button', { name: 'Criar usuário' }).click();
  const acesso = page.getByRole('dialog', { name: 'Acesso criado' });
  await acesso.waitFor();
  const senha = /Senha provisória:\s*(\S+)/.exec(await acesso.innerText())[1];
  await page.keyboard.press('Escape');
  await acesso.waitFor({ state: 'detached' });
  return senha;
}
async function criarEmpresa(page, d) {
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  const f = page.getByRole('dialog', { name: 'Nova empresa' });
  await f.getByLabel('Código').fill(d.codigo);
  await f.getByLabel('Razão social').fill(d.razao);
  await f.getByLabel('CNPJ').fill(d.cnpj);
  await escolher(page, 'Regime tributário', d.regime, f);
  await f.getByText(d.atividade, { exact: true }).click();
  if (d.funcionarios) await f.getByLabel('Sim').check();
  await escolher(page, 'UF', 'SP', f);
  await f.getByRole('textbox', { name: 'Município' }).fill('Campinas');
  if (d.fiscal) await escolher(page, 'Responsável Fiscal', d.fiscal, f);
  if (d.contabil) await escolher(page, 'Responsável Contábil', d.contabil, f);
  await f.getByRole('button', { name: 'Cadastrar empresa' }).click();
  await page.getByText(d.razao).waitFor();
}
const linhaTarefa = (page, empresa, obrigacao) =>
  page.locator('tr', { hasText: empresa }).filter({ hasText: obrigacao }).first();

let browserGlobal;
(async () => {
  const browser = await chromium.launch();
  browserGlobal = browser;
  const page = await (await contexto(browser)).newPage();
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));

  // Preparação: escritório, equipe, empresas
  await page.goto(APP);
  await page.getByRole('link', { name: 'Criar a conta do escritório' }).click();
  await page.getByLabel('Nome do escritório').fill('Escritório Etapa 3');
  await page.getByLabel('Seu nome').fill(GESTOR.nome);
  await page.getByLabel('Seu e-mail').fill(GESTOR.email);
  await page.getByLabel(/^Senha( \*)?$/).fill(GESTOR.senha);
  await page.getByLabel('Repita a senha').fill(GESTOR.senha);
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await page.getByRole('heading', { name: 'Painel' }).waitFor();
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  const senhaAna = await criarUsuario(page, 'Ana Fiscal', `ana.${sufixo}@teste.com`, 'Fiscal');
  const senhaCaio = await criarUsuario(page, 'Caio Contábil', `caio.${sufixo}@teste.com`, 'Contábil');
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await criarEmpresa(page, { codigo: '101', razao: 'Alfa Comércio Ltda', cnpj: '11444777000161', regime: 'Simples Nacional', atividade: 'Comércio', funcionarios: true, fiscal: 'Ana Fiscal', contabil: 'Caio Contábil' });
  await criarEmpresa(page, { codigo: '102', razao: 'Beta Serviços Ltda', cnpj: '11222333000181', regime: 'Lucro Presumido', atividade: 'Serviço', fiscal: 'Ana Fiscal', contabil: `${GESTOR.nome} (Gestor)` });
  ok('preparação: escritório, equipe (Fiscal e Contábil) e 2 empresas');

  // 1. Gerar checklists de 11/2026
  await page.getByRole('link', { name: 'Checklists do mês', exact: true }).click();
  await page.getByRole('heading', { name: 'Checklists do mês' }).waitFor();
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '11/2026', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar / atualizar' }).click();
  // Alfa (Simples/comércio/funcionários): DAS, DCTFWeb, Reinf, DeSTDA + 3 contábeis + folha, eSocial, FGTS, 13º 2ª = 11
  // Beta (Presumido/serviço): DCTFWeb, Reinf, EFD Contribuições, ISS, PIS/COFINS + 3 contábeis = 8
  await page.getByText(/^19 tarefa\(s\)/).waitFor();
  await linhaTarefa(page, 'Alfa Comércio', 'Apuração e guia do DAS').waitFor();
  assert.strictEqual(await linhaTarefa(page, 'Beta Serviços', 'Apuração e guia do DAS').count(), 0);
  assert.ok(await linhaTarefa(page, 'Alfa Comércio', 'Folha de pagamento').getByText('Sem responsável').isVisible());
  await foto(page, '30-checklists-mes');
  ok('gestor gera os checklists de 11/2026: 19 tarefas, só as que se aplicam, já com responsável');

  // 2. Gaveta da tarefa: situação, observação, anexo (botão e arrastar), histórico
  await linhaTarefa(page, 'Alfa Comércio', 'Apuração e guia do DAS').getByText('Apuração e guia do DAS').click();
  const g = page.getByRole('dialog', { name: 'Tarefa' });
  await g.getByText('Vencimento').waitFor();
  await g.getByText('Feita', { exact: false }).first().click();
  await g.getByLabel('Data de conclusão').waitFor();
  await g.getByLabel('Observação').fill('Guia enviada ao cliente por e-mail');
  await g.getByRole('button', { name: 'Salvar observação' }).click();
  await page.getByText('Observação salva.').waitFor();
  await g.getByTestId('anexar-arquivo').setInputFiles({ name: 'Guia DAS – Novembro.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 guia de teste') });
  await g.getByText('Guia DAS – Novembro.pdf', { exact: true }).waitFor();
  // Arrastar e soltar um arquivo na janela da tarefa
  await g.locator('textarea').evaluate((el) => {
    const alvo = el.closest('.mantine-Stack-root');
    const dt = new DataTransfer();
    dt.items.add(new File(['recibo'], 'Recibo de entrega.txt', { type: 'text/plain' }));
    alvo.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    alvo.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await g.getByText('Recibo de entrega.txt', { exact: true }).waitFor();
  await g.getByText(/alterou a situação: Pendente → Feito/).waitFor();
  await g.getByText(/anexou Guia DAS – Novembro.pdf/).waitFor();
  await g.getByText(/escreveu: "Guia enviada ao cliente por e-mail"/).waitFor();
  await foto(page, '31-tarefa');
  await page.keyboard.press('Escape');
  await linhaTarefa(page, 'Alfa Comércio', 'Apuração e guia do DAS').getByText('Feita', { exact: true }).waitFor();
  ok('tarefa: marcar como feita, data, observação, anexar pelo botão e arrastando, histórico de quem fez o quê');

  // 3. Competência anterior para ter atrasadas
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '09/2026', exact: true }).click();
  await page.getByRole('button', { name: /Gerar checklists de 09\/2026/ }).click();
  await page.getByText(/^19 tarefa\(s\)/).waitFor();
  await page.getByText('Atrasada').first().waitFor();
  ok('competência antiga gerada aparece como atrasada');

  // 4. Usuária fiscal: painel "Minhas tarefas"
  const pa = await (await contexto(browser)).newPage();
  await entrarPrimeiroAcesso(pa, `ana.${sufixo}@teste.com`, senhaAna, 'SenhaAna1234');
  await pa.getByRole('textbox', { name: 'Competência' }).click();
  await pa.getByRole('option', { name: '11/2026', exact: true }).click();
  await pa.getByText(/\+ 10 pendente\(s\) de meses anteriores/).waitFor();
  const atrasadas = Number((await pa.getByLabel(/^Atrasadas: \d+/).getAttribute('aria-label')).split(': ')[1]);
  assert.strictEqual(atrasadas, 10, 'as 10 fiscais de 09/2026 (inclui IRPJ do 3º trimestre) estão atrasadas');
  await foto(pa, '32-minhas-tarefas');
  assert.strictEqual(await pa.getByText('Contábil', { exact: true }).count(), 0, 'fiscal não vê tarefas contábeis');
  ok('fiscal vê só tarefas fiscais, com atrasadas de meses anteriores em destaque');

  // 5. Tempo real: Ana marca uma tarefa e o Gestor vê sem recarregar
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '11/2026', exact: true }).click();
  await linhaTarefa(page, 'Beta Serviços', 'Apuração do ISS').waitFor();
  // ISS de 11/2026 vence em 10/12: está em "Pendentes"
  await pa.getByRole('tab', { name: /^Pendentes/ }).click();
  await linhaTarefa(pa, 'Beta Serviços', 'Apuração do ISS').getByRole('checkbox').click();
  await linhaTarefa(page, 'Beta Serviços', 'Apuração do ISS').getByText('Feita', { exact: true }).waitFor({ timeout: 15000 });
  ok('fiscal marca tarefa e o Gestor vê a mudança na hora (tempo real)');

  // 6. Ana baixa o anexo enviado pelo Gestor
  await pa.getByRole('tab', { name: /Concluídas/ }).click();
  await linhaTarefa(pa, 'Alfa Comércio', 'Apuração e guia do DAS').getByText('Apuração e guia do DAS').click();
  const ga = pa.getByRole('dialog', { name: 'Tarefa' });
  const [download] = await Promise.all([pa.waitForEvent('download'), ga.getByRole('button', { name: 'Baixar Guia DAS – Novembro.pdf' }).click()]);
  // (No navegador de teste o nome com acento vira "download"; no app de computador abre "Salvar como" com o nome original —
  //  isso é testado em testes/electron-identificacao.cjs.) Aqui conferimos o conteúdo.
  const conteudo = require('fs').readFileSync(await download.path(), 'utf8');
  assert.strictEqual(conteudo, '%PDF-1.4 guia de teste');
  assert.strictEqual(await ga.getByRole('button', { name: /Remover Guia DAS/ }).count(), 0, 'não pode remover anexo de outra pessoa');
  assert.strictEqual(await ga.getByRole('textbox', { name: 'Responsável' }).count(), 0, 'usuária não troca o responsável');
  await pa.keyboard.press('Escape');
  ok('fiscal baixa o anexo; não remove anexo alheio nem troca o responsável');

  // 7. Usuário contábil não vê nada fiscal
  const pc = await (await contexto(browser)).newPage();
  await entrarPrimeiroAcesso(pc, `caio.${sufixo}@teste.com`, senhaCaio, 'SenhaCaio1234');
  await pc.getByRole('textbox', { name: 'Competência' }).click();
  await pc.getByRole('option', { name: '11/2026', exact: true }).click();
  await pc.getByText('Todas das minhas empresas', { exact: true }).click();
  await pc.getByText(/\+ 3 pendente\(s\) de meses anteriores/).waitFor();
  const textoCaio = await pc.locator('main').innerText();
  assert.ok(!/DAS|DCTFWeb|EFD-Reinf|Beta Serviços/.test(textoCaio), 'contábil não vê tarefas fiscais nem empresa que não atende');
  const tentativa = await pc.evaluate(async () => {
    const chave = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    const token = JSON.parse(localStorage.getItem(chave)).access_token;
    const h = { apikey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', Authorization: `Bearer ${token}` };
    const t = await (await fetch('http://127.0.0.1:54321/rest/v1/tarefas?select=area', { headers: h })).json();
    const a = await (await fetch('http://127.0.0.1:54321/rest/v1/tarefa_anexos?select=nome_arquivo', { headers: h })).json();
    return { areas: [...new Set(t.map((x) => x.area))], anexos: a.length };
  });
  assert.deepStrictEqual(tentativa, { areas: ['contabil'], anexos: 0 });
  ok('contábil vê só as tarefas contábeis das suas empresas — e o banco bloqueia o resto, inclusive anexos');

  // 8. Painel do Gestor
  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '11/2026', exact: true }).click();
  await page.getByText('Conclusão geral').waitFor();
  await page.getByText('2 de 19 tarefas').waitFor();
  assert.ok(await page.getByText('Desempenho por responsável').isVisible());
  await page.locator('tr', { hasText: 'Ana Fiscal' }).first().waitFor();
  await page.locator('tr', { hasText: 'Sem responsável' }).first().waitFor();
  await page.getByRole('grid', { name: 'Grade de empresas por obrigação' }).waitFor();
  await foto(page, '33-painel');
  await page.getByRole('button', { name: /Alfa Comércio Ltda, Apuração e guia do DAS: Feita/ }).click();
  await page.getByRole('dialog', { name: 'Tarefa' }).getByText('Guia DAS – Novembro.pdf', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  ok('painel: conclusão geral, desempenho por responsável, grade empresas × obrigações (célula abre a tarefa)');

  // Filtro por responsável muda os números
  await escolher(page, 'Responsável', 'Ana Fiscal');
  await page.getByText(/de 9 tarefas/).waitFor();
  ok('filtro por responsável atualiza o painel');

  // 9. Transferência de tarefas (férias): Ana -> Gestora
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await page.getByRole('row', { name: /Ana Fiscal/ }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Transferir responsabilidades' }).click();
  await escolher(page, 'Transferir para', `${GESTOR.nome} — Gestor`);
  await page.getByRole('dialog').getByRole('button', { name: 'Transferir' }).click();
  await page.getByText(/responsabilidade\(s\) transferida\(s\)/).waitFor();
  await pa.reload();
  await pa.getByRole('textbox', { name: 'Competência' }).click();
  await pa.getByRole('option', { name: '11/2026', exact: true }).click();
  await pa.getByLabel('Atrasadas: 0').waitFor();
  ok('transferir responsabilidades leva junto as tarefas em aberto');

  await browser.close();
  console.log(`\nTODOS OS ${passo} TESTES DE TELA DAS ETAPAS 3 E 4 PASSARAM`);
})().catch(async (e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 8).join(' | '));
  let i = 0;
  for (const c of browserGlobal?.contexts() ?? []) for (const p of c.pages()) {
    await p.screenshot({ path: `/var/tmp/falha3-${i}.png` }).catch(() => {});
    console.error(`  tela ${i++}: ${p.url()}`);
  }
  process.exit(1);
});
