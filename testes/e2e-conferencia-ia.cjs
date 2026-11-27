// Teste de ponta a ponta da conferência com IA.
// A IA é simulada: este teste sobe um servidor falso da Anthropic na porta 8787 (não gasta créditos).
// Requer: Supabase local (npx supabase start), a função servida com a IA simulada
//   npx supabase functions serve --env-file testes/ia-simulada.env
// e o app (npx vite).
const http = require('http');
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

// ---------------- IA simulada (fala o mesmo formato da API da Anthropic, em streaming) ----------------
const pedidos = [];
const RESULTADO = {
  conclusao: 'divergencias',
  resumo: 'O valor da guia do DAS é menor que o apurado no PGDAS.',
  itens_conferidos: [
    { item: 'Valor da guia x apuração', situacao: 'divergencia', detalhe: 'Guia R$ 1.000,00; apuração R$ 1.250,00.' },
    { item: 'Competência e CNPJ', situacao: 'ok', detalhe: 'Competência 11/2026 e CNPJ conferem.' },
  ],
  divergencias: [{
    descricao: 'Guia do DAS com valor menor que o apurado', gravidade: 'alta', onde: 'apuracao.csv, linha 2',
    valor_esperado: 'R$ 1.250,00', valor_encontrado: 'R$ 1.000,00', sugestao: 'Emita a guia complementar de R$ 250,00.',
  }],
  dados_faltantes: ['Comprovante de pagamento'],
};
function sse(res, eventos) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [tipo, dados] of eventos) res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`);
  res.end();
}
const iaSimulada = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const pedido = JSON.parse(corpo || '{}');
    pedidos.push({ url: req.url, headers: req.headers, pedido });
    const texto = JSON.stringify(pedido.messages?.[0]?.content ?? '');
    const recusar = texto.includes('RECUSAR');
    const msg = { id: 'msg_teste', type: 'message', role: 'assistant', model: pedido.model, content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 1 } };
    const json = JSON.stringify(RESULTADO);
    sse(res, [
      ['message_start', { message: msg }],
      ...(recusar ? [] : [
        ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: json.slice(0, 40) } }],
        ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: json.slice(40) } }],
        ['content_block_stop', { index: 0 }],
      ]),
      ['message_delta', { delta: { stop_reason: recusar ? 'refusal' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 350 } }],
      ['message_stop', {}],
    ]);
  });
});

let browserGlobal;
(async () => {
  await new Promise((r) => iaSimulada.listen(8787, '0.0.0.0', r));
  const browser = await chromium.launch();
  browserGlobal = browser;
  const page = await (await contexto(browser)).newPage();
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));

  // Preparação: escritório, empresa do Simples e checklists de 11/2026
  await page.goto(APP);
  await page.getByRole('link', { name: 'Criar a conta do escritório' }).click();
  await page.getByLabel('Nome do escritório').fill('Escritório IA');
  await page.getByLabel('Seu nome').fill('Iara Gestora');
  await page.getByLabel('Seu e-mail').fill(`gestora.ia.${sufixo}@teste.com`);
  await page.getByLabel(/^Senha( \*)?$/).fill('SenhaGestora1');
  await page.getByLabel('Repita a senha').fill('SenhaGestora1');
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await page.getByRole('heading', { name: 'Painel' }).waitFor();
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  const f = page.getByRole('dialog', { name: 'Nova empresa' });
  await f.getByLabel('Código').fill('501');
  await f.getByLabel('Razão social').fill('Delta Comércio Ltda');
  await escolher(page, 'Regime tributário', 'Simples Nacional', f);
  await f.getByText('Comércio', { exact: true }).click();
  await f.getByRole('button', { name: 'Cadastrar empresa' }).click();
  await page.getByText('Delta Comércio Ltda').waitFor();
  await page.getByRole('link', { name: 'Checklists do mês', exact: true }).click();
  await page.getByRole('textbox', { name: 'Competência' }).click();
  await page.getByRole('option', { name: '11/2026', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar / atualizar' }).click();
  const das = page.locator('tr', { hasText: 'Delta Comércio' }).filter({ hasText: 'Apuração e guia do DAS' }).first();
  await das.waitFor();
  ok('preparação: gestora, empresa do Simples e checklists de 11/2026');

  // 1. Anexa a apuração na tarefa do DAS e confere com IA
  await das.getByText('Apuração e guia do DAS').click();
  const g = page.getByRole('dialog', { name: 'Tarefa' });
  await g.getByTestId('anexar-arquivo').setInputFiles({
    name: 'apuracao.csv', mimeType: 'text/csv', buffer: Buffer.from('competencia;valor_apurado;valor_guia\n11/2026;1250,00;1000,00\n'),
  });
  await g.getByText('apuracao.csv', { exact: true }).waitFor();
  await g.getByRole('button', { name: 'Conferir com IA' }).click();
  const m = page.getByRole('dialog', { name: 'Conferência com IA' });
  assert.equal(await m.getByRole('textbox', { name: 'O que conferir' }).inputValue(), 'Guias de impostos', 'tipo sugerido pelo nome da tarefa');
  assert.ok(await m.getByRole('checkbox', { name: /apuracao\.csv/ }).isChecked(), 'anexo da tarefa já vem marcado');
  await m.getByLabel('Instruções (opcional)').fill('Confira o valor da guia.');
  await foto(page, '60-conferir-ia');
  await m.getByRole('button', { name: 'Conferir' }).click();
  await m.getByText('Guia do DAS com valor menor que o apurado').waitFor({ timeout: 30000 });
  await m.getByText('R$ 1.250,00', { exact: false }).first().waitFor();
  await m.getByText('Comprovante de pagamento').waitFor();
  await foto(page, '61-resultado-ia');
  ok('conferência dos anexos da tarefa mostra divergências, itens conferidos e o que faltou');

  // O pedido à IA saiu como esperado (sem chave no programa; conteúdo e contexto corretos)
  assert.equal(pedidos.length, 1);
  const p = pedidos[0];
  const chave = p.headers['x-api-key'] || String(p.headers.authorization || '').replace(/^Bearer /, '');
  assert.equal(chave, 'sk-ant-teste-simulado', 'a chave vem do servidor');
  assert.ok(String(p.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  assert.equal(p.pedido.model, 'claude-opus-5-5');
  assert.equal(p.pedido.fallbacks, 'default');
  assert.equal(p.pedido.stream, true);
  assert.equal(p.pedido.output_config.format.type, 'json_schema');
  const conteudo = p.pedido.messages[0].content;
  assert.deepEqual(conteudo[0], { type: 'document', title: 'apuracao.csv', source: { type: 'text', media_type: 'text/plain', data: 'competencia;valor_apurado;valor_guia\n11/2026;1250,00;1000,00\n' } });
  assert.match(conteudo[1].text, /Delta Comércio Ltda/);
  assert.match(conteudo[1].text, /Simples Nacional/);
  assert.match(conteudo[1].text, /Apuração e guia do DAS/);
  assert.match(conteudo[1].text, /Confira o valor da guia\./);
  ok('pedido à IA: chave só no servidor, documento, empresa, tarefa e instruções no contexto');

  await m.getByRole('button', { name: 'Fechar' }).click();
  await g.getByText('Conferências com IA').waitFor();
  await g.getByText(/Guias de impostos — O valor da guia do DAS/).waitFor();
  ok('a conferência aparece na tarefa');
  await page.keyboard.press('Escape');

  // 2. Tela de conferências: histórico e conferência livre com arquivo do computador
  await page.getByRole('link', { name: 'Conferência com IA', exact: true }).click();
  await page.getByRole('heading', { name: 'Conferência com IA' }).waitFor();
  const reg = page.locator('tr', { hasText: 'Delta Comércio Ltda' }).first();
  await reg.getByText('Divergências').waitFor();
  await reg.getByText('Iara Gestora').waitFor();
  await foto(page, '62-historico-ia');
  await reg.click();
  await page.getByRole('dialog', { name: 'Conferência com IA' }).getByText('Emita a guia complementar', { exact: false }).waitFor();
  await page.keyboard.press('Escape');
  ok('histórico lista a conferência e abre o resultado completo');

  await page.getByRole('button', { name: 'Nova conferência' }).click();
  const n = page.getByRole('dialog', { name: 'Conferência com IA' });
  await escolher(page, 'O que conferir', 'Livre', n);
  await n.getByTestId('arquivo-conferencia').setInputFiles({ name: 'relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await n.getByRole('button', { name: 'Conferir' }).click();
  await n.getByText('Na conferência livre, escreva o que a IA deve conferir.').waitFor();
  await n.getByLabel('O que a IA deve conferir?').fill('RECUSAR este pedido de teste');
  await n.getByRole('button', { name: 'Conferir' }).click();
  await n.getByText('A IA não conseguiu conferir estes arquivos.', { exact: false }).waitFor({ timeout: 30000 });
  assert.deepEqual(pedidos[1].pedido.messages[0].content[0].source, { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4 teste').toString('base64') });
  ok('conferência livre exige instruções; PDF vai como documento; recusa da IA vira aviso claro');
  await n.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await page.locator('tbody tr').count(), 1, 'recusa não entra no histórico');

  await browser.close();
  iaSimulada.close();
  console.log(`\nTODOS OS ${passo} TESTES DE TELA DA CONFERÊNCIA COM IA PASSARAM`);
})().catch(async (e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 6).join(' | '));
  let i = 0;
  for (const c of browserGlobal?.contexts() ?? []) for (const p of c.pages()) {
    await p.screenshot({ path: `/var/tmp/falha-ia-${i}.png` }).catch(() => {});
    console.error(`  tela ${i++}: ${p.url()}`);
  }
  process.exit(1);
});
