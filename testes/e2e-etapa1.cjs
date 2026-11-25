// Teste de ponta a ponta da Etapa 1, usando o app como uma pessoa usaria.
// Requer: Supabase local rodando (npx supabase start) e o app em http://localhost:5173 (npx vite).
const { chromium } = require('playwright');
const assert = require('assert');

const APP = process.env.APP_URL || 'http://localhost:5173';
const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const FOTOS = process.env.FOTOS || null;
const sufixo = Date.now().toString(36);
const GESTOR = { nome: 'Marina Gestora', email: `gestora.${sufixo}@teste.com`, senha: 'SenhaGestora1' };

let passo = 0;
const ok = (m) => console.log(`ok ${++passo} - ${m}`);

async function foto(page, nome) {
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nome}.png` });
}

async function entrar(page, email, senha) {
  await page.goto(APP);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel(/^Senha( \*)?$/).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function sair(page) {
  await page.locator('.mantine-AppShell-navbar button').last().click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await page.getByRole('heading', { name: 'Entrar' }).waitFor();
}

async function escolher(page, rotulo, opcao) {
  await page.getByRole('textbox', { name: rotulo }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}

async function criarUsuario(page, nome, email, area) {
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome').fill(nome);
  await modal.getByLabel('E-mail').fill(email);
  await modal.getByLabel(area).check();
  await modal.getByRole('button', { name: 'Criar usuário' }).click();
  const acesso = page.getByRole('dialog', { name: 'Acesso criado' });
  await acesso.waitFor();
  const texto = await acesso.innerText();
  const senha = /Senha provisória:\s*(\S+)/.exec(texto)[1];
  await foto(page, `03-acesso-${area}`);
  await acesso.getByRole('button', { name: /close|fechar/i }).click().catch(() => page.keyboard.press('Escape'));
  await page.keyboard.press('Escape');
  return senha;
}

async function criarEmpresa(page, d) {
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  const m = page.getByRole('dialog');
  await m.getByLabel('CNPJ').fill(d.cnpj);
  await m.getByLabel('Razão social').fill(d.razao);
  await escolher(page, 'Regime tributário', d.regime);
  await m.getByText(d.atividade, { exact: true }).click();
  await escolher(page, 'UF', d.uf);
  await m.getByRole('textbox', { name: 'Município' }).fill(d.municipio);
  if (d.fiscal) await escolher(page, 'Responsável Fiscal', d.fiscal);
  if (d.contabil) await escolher(page, 'Responsável Contábil', d.contabil);
  if (d.telefone) await m.getByLabel('Telefone').fill(d.telefone);
  await m.getByRole('button', { name: 'Cadastrar empresa' }).click();
}

let browserGlobal;
(async () => {
  const browser = await chromium.launch();
  browserGlobal = browser;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', deviceScaleFactor: FOTOS ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));

  // 1. Criar a conta do escritório
  await page.goto(APP);
  await page.getByRole('heading', { name: 'Entrar' }).waitFor();
  await foto(page, '01-login');
  await page.getByRole('link', { name: 'Criar a conta do escritório' }).click();
  await page.getByLabel('Nome do escritório').fill('Contabilidade Exemplo');
  await page.getByLabel('Seu nome').fill(GESTOR.nome);
  await page.getByLabel('Seu e-mail').fill(GESTOR.email);
  await page.getByLabel(/^Senha( \*)?$/).fill(GESTOR.senha);
  await page.getByLabel('Repita a senha').fill(GESTOR.senha);
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await page.getByRole('heading', { name: 'Painel' }).waitFor();
  for (const item of ['Painel', 'Empresas', 'Checklists do mês', 'Modelos de checklist', 'Equipe', 'Configurações']) {
    await page.locator('nav, .mantine-AppShell-navbar').getByText(item, { exact: true }).waitFor();
  }
  ok('gestor cria o escritório e vê o menu completo de Gestor');

  // 2. Equipe
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await page.getByRole('heading', { name: 'Equipe' }).waitFor();
  const senhaFiscal = await criarUsuario(page, 'Fábio Fiscal', `fiscal.${sufixo}@teste.com`, 'Fiscal');
  const senhaContabil = await criarUsuario(page, 'Carla Contábil', `contabil.${sufixo}@teste.com`, 'Contábil');
  await page.getByText('Carla Contábil').waitFor();
  await foto(page, '04-equipe');
  ok('gestor cria usuário Fiscal e usuário Contábil com senha provisória');

  // 3. Empresas
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await page.getByRole('heading', { name: 'Empresas' }).waitFor();

  // CNPJ inválido é recusado
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  await page.getByRole('dialog').getByLabel('CNPJ').fill('11222333000182');
  await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar empresa' }).click();
  await page.getByText('CNPJ inválido').waitFor();
  const valorMascara = await page.getByRole('dialog').getByLabel('CNPJ').inputValue();
  assert.strictEqual(valorMascara, '11.222.333/0001-82');
  await page.keyboard.press('Escape');
  ok('CNPJ com máscara e validação (inválido é recusado)');

  await criarEmpresa(page, { cnpj: '11444777000161', razao: 'Padaria Pão Quente Ltda', regime: 'Lucro Presumido', atividade: 'Comércio', uf: 'SP', municipio: 'Campinas', fiscal: 'Fábio Fiscal', contabil: 'Carla Contábil', telefone: '19987654321' });
  await page.getByText('Padaria Pão Quente Ltda').waitFor();
  await criarEmpresa(page, { cnpj: '12ABC34501DE35', razao: 'Tech Serviços Digitais S.A.', regime: 'Lucro Real', atividade: 'Serviço', uf: 'MG', municipio: 'Belo Horizonte', contabil: 'Carla Contábil' });
  await page.getByText('Tech Serviços Digitais S.A.').waitFor();
  await page.getByText('12.ABC.345/01DE-35').waitFor();
  await criarEmpresa(page, { cnpj: '04252011000110', razao: 'Mercadinho da Esquina ME', regime: 'Simples Nacional', atividade: 'Comércio', uf: 'RJ', municipio: 'Niterói' });
  await page.getByText('Mercadinho da Esquina ME').waitFor();
  await foto(page, '05-empresas');
  ok('gestor cadastra 3 empresas (inclusive CNPJ alfanumérico)');

  // Filtros
  await page.getByLabel('Buscar').fill('padaria');
  await page.getByText('Tech Serviços').waitFor({ state: 'detached' });
  await page.getByText('Padaria Pão Quente Ltda').waitFor();
  await page.getByLabel('Buscar').fill('04.252');
  await page.getByText('Mercadinho da Esquina ME').waitFor();
  await page.getByLabel('Buscar').fill('');
  await escolher(page, 'Responsável', 'Carla Contábil');
  await page.getByText('Mercadinho da Esquina ME').waitFor({ state: 'detached' });
  ok('busca por nome, por CNPJ e filtro por responsável');

  // Edição abre preenchida, com telefone mascarado
  await page.getByText('Padaria Pão Quente Ltda').click();
  assert.strictEqual(await page.getByRole('dialog').getByLabel('Telefone').inputValue(), '(19) 98765-4321');
  await foto(page, '06-empresa-form');
  await page.keyboard.press('Escape');
  ok('edição de empresa abre com dados e máscaras');
  await sair(page);

  // 4. Fiscal: primeiro acesso + só vê a Padaria
  const fiscal = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1 });
  const pf = await fiscal.newPage();
  await entrar(pf, `fiscal.${sufixo}@teste.com`, senhaFiscal);
  await pf.getByText('crie uma senha só sua').waitFor();
  await pf.getByLabel(/^Nova senha( \*)?$/).fill('SenhaFiscal1');
  await pf.getByLabel('Repita a nova senha').fill('SenhaFiscal1');
  await pf.getByRole('button', { name: 'Salvar e continuar' }).click();
  await pf.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
  const menuFiscal = await pf.locator('.mantine-AppShell-navbar a').allInnerTexts();
  assert.deepStrictEqual(menuFiscal.map((t) => t.trim()), ['Minhas tarefas', 'Minhas empresas', 'Perfil']);
  ok('fiscal troca a senha provisória e vê o menu de Usuário (sem Empresas/Equipe)');
  await pf.getByRole('link', { name: 'Minhas empresas', exact: true }).click();
  await pf.getByText('Padaria Pão Quente Ltda').waitFor();
  assert.strictEqual(await pf.getByText('Tech Serviços Digitais S.A.').count(), 0);
  assert.strictEqual(await pf.getByText('Mercadinho da Esquina ME').count(), 0);
  await foto(pf, '07-fiscal-minhas-empresas');
  ok('fiscal vê só a empresa em que é responsável');

  // Tentar acessar tela de gestor pelo endereço
  await pf.goto(APP + '/#/equipe');
  await pf.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
  ok('fiscal não abre telas de Gestor nem digitando o endereço');

  // Tentar burlar direto no banco, usando a sessão do fiscal
  const burla = await pf.evaluate(async (apikey) => {
    const chave = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const token = JSON.parse(localStorage.getItem(chave)).access_token;
    const base = 'http://127.0.0.1:54321';
    const h = { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const lista = await (await fetch(`${base}/rest/v1/empresas?select=razao_social`, { headers: h })).json();
    const upd = await (await fetch(`${base}/rest/v1/empresas?id=not.is.null`, { method: 'PATCH', headers: h, body: JSON.stringify({ razao_social: 'HACK' }) })).json();
    const promo = await (await fetch(`${base}/rest/v1/membros?id=not.is.null`, { method: 'PATCH', headers: h, body: JSON.stringify({ papel: 'gestor' }) })).json();
    const func = await fetch(`${base}/functions/v1/admin-usuarios`, { method: 'POST', headers: h, body: JSON.stringify({ acao: 'criar', nome: 'X', email: 'x@x.com', senha: '12345678', areas: ['fiscal'] }) });
    return { lista: lista.map((e) => e.razao_social), upd, promo, funcStatus: func.status };
  }, process.env.VITE_SUPABASE_KEY);
  assert.deepStrictEqual(burla.lista, ['Padaria Pão Quente Ltda']);
  assert.deepStrictEqual(burla.upd, []);
  assert.deepStrictEqual(burla.promo, []);
  assert.strictEqual(burla.funcStatus, 403);
  ok('banco recusa o fiscal ao tentar ler outras empresas, alterar, se promover ou criar usuários direto pela API');

  // 5. Contábil: vê Padaria e Tech
  const contabil = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: FOTOS ? 2 : 1 });
  const pc = await contabil.newPage();
  await entrar(pc, `contabil.${sufixo}@teste.com`, senhaContabil);
  await pc.getByLabel(/^Nova senha( \*)?$/).fill('SenhaContabil1');
  await pc.getByLabel('Repita a nova senha').fill('SenhaContabil1');
  await pc.getByRole('button', { name: 'Salvar e continuar' }).click();
  await pc.getByRole('link', { name: 'Minhas empresas', exact: true }).click();
  await pc.getByText('Padaria Pão Quente Ltda').waitFor();
  await pc.getByText('Tech Serviços Digitais S.A.').waitFor();
  assert.strictEqual(await pc.getByText('Mercadinho da Esquina ME').count(), 0);
  const badges = (await pc.locator('.mantine-Card-root').first().innerText()).toLowerCase();
  assert.ok(badges.includes('contábil') && !badges.includes('fiscal'), 'cartão mostra só a área contábil');
  await foto(pc, '08-contabil-minhas-empresas');
  ok('contábil vê as suas 2 empresas e só a parte contábil');

  // 6. Tempo real: gestor designa o Mercadinho para o fiscal; a tela do fiscal atualiza sozinha
  await pf.getByRole('link', { name: 'Minhas empresas', exact: true }).click();
  await pf.getByText('Padaria Pão Quente Ltda').waitFor();
  assert.strictEqual(await pf.getByText('Mercadinho da Esquina ME').count(), 0);
  await entrar(page, GESTOR.email, GESTOR.senha);
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await page.getByRole('row', { name: /Fábio Fiscal/ }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Editar áreas e empresas' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Empresas que atende' }).click();
  await page.getByRole('option', { name: 'Mercadinho da Esquina ME' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await pf.getByText('Mercadinho da Esquina ME').waitFor({ timeout: 15000 });
  ok('fiscal passa a ver a nova empresa na hora, sem reiniciar (tempo real)');

  // 7. Transferência: Carla de férias -> responsabilidades contábeis para… gestor
  await page.getByRole('row', { name: /Carla Contábil/ }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Transferir responsabilidades' }).click();
  await escolher(page, 'Transferir para', `${GESTOR.nome} — Gestor`);
  await page.getByRole('dialog').getByRole('button', { name: 'Transferir' }).click();
  await page.getByText('2 responsabilidade(s) transferida(s)').waitFor();
  ok('transferência de responsabilidades');

  // 8. Desativar o fiscal: ele é bloqueado
  await page.getByRole('row', { name: /Fábio Fiscal/ }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Desativar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desativar' }).click();
  await page.getByText('Usuário desativado.').waitFor();
  await pf.getByText('Acesso desativado').waitFor({ timeout: 15000 });
  const pf2 = await (await browser.newContext()).newPage();
  await entrar(pf2, `fiscal.${sufixo}@teste.com`, 'SenhaFiscal1');
  await pf2.getByText('Este usuário foi desativado').waitFor();
  ok('usuário desativado é expulso na hora e não consegue mais entrar');

  // 9. Esqueci minha senha (código por e-mail)
  const pr = await (await browser.newContext()).newPage();
  await pr.goto(APP);
  await pr.getByText('Esqueci minha senha').click();
  await pr.getByLabel('E-mail').fill(`contabil.${sufixo}@teste.com`);
  await pr.getByRole('button', { name: 'Enviar código' }).click();
  await pr.getByText('Enviamos um código').waitFor();
  let codigo = null;
  for (let i = 0; i < 20 && !codigo; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const lista = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:contabil.' + sufixo + '@teste.com')}`)).json();
    const msg = lista.messages?.[0];
    if (msg) {
      const corpo = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      codigo = /(\d{6})/.exec(corpo.Text || corpo.HTML)?.[1];
    }
  }
  assert.ok(codigo, 'código chegou por e-mail');
  await pr.locator('input[inputmode="numeric"]').first().click();
  await pr.keyboard.type(codigo);
  await pr.getByLabel(/^Nova senha( \*)?$/).fill('NovaSenha123');
  await pr.getByLabel('Repita a nova senha').fill('NovaSenha123');
  await pr.getByRole('button', { name: 'Salvar nova senha' }).click();
  await pr.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
  ok('esqueci minha senha: código por e-mail e nova senha');

  // 10. Manter conectado: sem marcar, a sessão não fica salva permanentemente
  const pm = await (await browser.newContext()).newPage();
  await pm.goto(APP);
  await pm.getByLabel('Manter conectado neste computador').uncheck();
  await pm.getByLabel('E-mail').fill(GESTOR.email);
  await pm.getByLabel(/^Senha( \*)?$/).fill(GESTOR.senha);
  await pm.getByRole('button', { name: 'Entrar' }).click();
  await pm.getByRole('heading', { name: 'Painel' }).waitFor();
  const salvoPermanente = await pm.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')));
  assert.strictEqual(salvoPermanente, false);
  ok('"manter conectado" desmarcado não guarda a sessão de forma permanente');

  // 11. Importar planilha (exemplo com nomes fictícios)
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  await page.getByTestId('arquivo-planilha').setInputFiles(require('path').join(__dirname, 'arquivos', 'planilha-exemplo.xlsx'));
  const imp = page.getByRole('dialog', { name: 'Importar empresas de uma planilha' });
  await imp.getByText('4 empresas na planilha').waitFor();
  assert.strictEqual(await imp.getByRole('textbox', { name: 'Usuário para Marina' }).inputValue(), `${GESTOR.nome} (Gestor)`);
  assert.strictEqual(await imp.getByRole('textbox', { name: 'Usuário para Carla' }).inputValue(), 'Carla Contábil');
  assert.strictEqual(await imp.getByRole('textbox', { name: 'Usuário para Fabio' }).inputValue(), '');
  ok('importação lê a planilha e liga os nomes aos usuários automaticamente');
  await imp.getByRole('row', { name: /Fabio/ }).getByRole('button', { name: 'Cadastrar' }).click();
  const nova = page.getByRole('dialog', { name: 'Novo usuário' });
  assert.strictEqual(await nova.getByLabel('Nome').inputValue(), 'Fabio');
  assert.ok(await nova.getByLabel('Fiscal').isChecked());
  await nova.getByLabel('E-mail').fill(`fabio2.${sufixo}@teste.com`);
  await nova.getByRole('button', { name: 'Criar usuário' }).click();
  await page.getByRole('dialog', { name: 'Acesso criado' }).waitFor();
  await foto(page, '10-importacao-acesso');
  await page.getByRole('dialog', { name: 'Acesso criado' }).getByRole('button', { name: /close|fechar/i }).click().catch(() => page.keyboard.press('Escape'));
  await page.waitForFunction(() => {
    const el = document.querySelector('[aria-label="Usuário para Fabio"]');
    return el && el.value === 'Fabio';
  }, null, { timeout: 15000 });
  await imp.getByText('com observações').first().click();
  await imp.getByText('responsável Contábil ilegível ("##########")').waitFor();
  await foto(page, '09-importacao');
  await imp.getByRole('button', { name: 'Importar 4 empresa(s)' }).click();
  await page.getByText('4 empresa(s) nova(s) e 0 atualizada(s)').waitFor();
  await page.getByText('GAMA INDUSTRIA FICTICIA SA').waitFor();
  assert.ok(await page.getByRole('row', { name: /ALFA COMERCIO/ }).getByText('Incompleto').isVisible());
  ok('cadastra pessoa nova direto da importação e importa as empresas (marcadas como incompletas)');

  // Reimportar não duplica
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  await page.getByTestId('arquivo-planilha').setInputFiles(require('path').join(__dirname, 'arquivos', 'planilha-exemplo.xlsx'));
  await imp.getByText('0 nova(s)').waitFor();
  await imp.getByRole('button', { name: 'Importar 4 empresa(s)' }).click();
  await page.getByText('0 empresa(s) nova(s) e 4 atualizada(s)').waitFor();
  ok('importar de novo atualiza sem duplicar');
  await foto(page, '11-empresas-importadas');

  // Planilha real (opcional, só local): conta quantas empresas entram
  if (process.env.PLANILHA_REAL) {
    await page.getByRole('button', { name: 'Importar planilha' }).click();
    await page.getByTestId('arquivo-planilha').setInputFiles(process.env.PLANILHA_REAL);
    await imp.getByText(/empresas na planilha/).waitFor();
    const resumo = await imp.locator('.mantine-Badge-root').allInnerTexts();
    console.log('   planilha real:', resumo.slice(0, 4).join(' | '));
    const botao = imp.getByRole('button', { name: /^Importar \d+ empresa/ });
    await botao.click();
    await page.getByText(/nova\(s\) e \d+ atualizada/).waitFor();
    console.log('   ' + (await page.getByText(/nova\(s\) e \d+ atualizada/).innerText()));
    ok('planilha real importada');
  }

  await browser.close();
  console.log(`\nTODOS OS ${passo} TESTES DE TELA PASSARAM`);
})().catch(async (e) => {
  console.error('FALHOU:', e.message);
  const pasta = process.env.FALHAS || '/var/tmp';
  let i = 0;
  for (const c of browserGlobal?.contexts() ?? []) for (const p of c.pages()) {
    await p.screenshot({ path: `${pasta}/falha-${i}.png` }).catch(() => {});
    console.error(`  tela ${i++}: ${p.url()} -> ${pasta}/falha-${i - 1}.png`);
    console.error('  texto:', (await p.innerText('body').catch(() => '')).slice(0, 300).replace(/\n+/g, ' | '));
  }
  process.exit(1);
});
