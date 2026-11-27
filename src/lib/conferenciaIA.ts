// Conferência contábil com IA: preparação dos arquivos e chamada à função segura do servidor.
// A chave da IA fica só no Supabase (função "conferencia-ia"); o programa nunca a vê.
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { supabase } from './supabase';
import type { Anexo } from './tipos';

export type TipoConferencia = 'balancete' | 'conciliacao_bancaria' | 'guias_impostos' | 'folha' | 'livre';
export type Conclusao = 'sem_divergencias' | 'atencao' | 'divergencias' | 'inconclusivo';

export const TIPOS_CONFERENCIA: { value: TipoConferencia; label: string; descricao: string }[] = [
  { value: 'balancete', label: 'Balancete', descricao: 'Débitos x créditos, saldos que não fecham, contas invertidas, Ativo = Passivo + PL.' },
  { value: 'conciliacao_bancaria', label: 'Conciliação bancária', descricao: 'Extrato x razão do banco: lançamentos sem par, valores e datas divergentes.' },
  { value: 'guias_impostos', label: 'Guias de impostos', descricao: 'Guias (DAS, DARF, GPS, ISS…) x apuração e comprovantes: valor, competência, código, vencimento.' },
  { value: 'folha', label: 'Folha de pagamento', descricao: 'Totais da folha, INSS/IRRF/FGTS x guias e declarações, líquido x pagamentos.' },
  { value: 'livre', label: 'Livre', descricao: 'Você descreve o que a IA deve conferir nos arquivos.' },
];
export const rotuloTipoConferencia = (t: string) => TIPOS_CONFERENCIA.find((x) => x.value === t)?.label ?? t;

/** Tipo de conferência sugerido pelo nome da tarefa */
export function sugerirTipo(nomeTarefa: string | undefined): TipoConferencia {
  const n = (nomeTarefa ?? '').toLowerCase();
  if (/concilia|extrato|banc/.test(n)) return 'conciliacao_bancaria';
  if (/balancete|balan[cç]o|razão|razao|encerramento|ecd|ecf/.test(n)) return 'balancete';
  if (/folha|esocial|fgts|inss|pr[oó]-labore|f[eé]rias|rescis/.test(n)) return 'folha';
  if (/\bdas\b|darf|guia|simples|pis|cofins|icms|iss|irpj|csll|dctf|apura/.test(n)) return 'guias_impostos';
  return 'livre';
}

export const CONCLUSOES: Record<Conclusao, { label: string; cor: string }> = {
  sem_divergencias: { label: 'Sem divergências', cor: 'green' },
  atencao: { label: 'Pontos de atenção', cor: 'yellow' },
  divergencias: { label: 'Divergências', cor: 'red' },
  inconclusivo: { label: 'Inconclusivo', cor: 'gray' },
};

export type ItemConferido = { item: string; situacao: 'ok' | 'atencao' | 'divergencia' | 'nao_verificado'; detalhe: string };
export type Divergencia = {
  descricao: string;
  gravidade: 'alta' | 'media' | 'baixa';
  onde: string;
  valor_esperado: string;
  valor_encontrado: string;
  sugestao: string;
};
export type ResultadoIA = {
  conclusao: Conclusao;
  resumo: string;
  itens_conferidos: ItemConferido[];
  divergencias: Divergencia[];
  dados_faltantes: string[];
};

export type Conferencia = {
  id: string | null;
  escritorio_id: string;
  empresa_id: string | null;
  tarefa_id: string | null;
  tipo: TipoConferencia;
  instrucoes: string | null;
  arquivos: { nome: string; tipo: string; tamanho: number | null }[];
  conclusao: Conclusao;
  resumo: string;
  resultado: ResultadoIA;
  modelo: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  criado_por: string;
  criado_em: string;
};

/** Arquivo pronto para enviar à IA */
export type ArquivoPreparado = {
  nome: string;
  tipo: 'pdf' | 'imagem' | 'texto';
  media_type?: string;
  dados: string; // base64 (pdf/imagem) ou texto
  tamanho: number;
};

export const MAX_ARQUIVOS_IA = 10;
export const LIMITE_TOTAL_IA = 20 * 1024 * 1024;
export const LIMITE_TEXTO_IA = 400_000;
export const EXTENSOES_ACEITAS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.xlsx', '.csv', '.txt', '.ofx', '.xml'];

const IMAGENS: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const TEXTOS = ['csv', 'txt', 'ofx', 'xml', 'ret'];

export function extensao(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : '';
}

/** Como o arquivo será enviado (ou null se o formato não é aceito) */
export function classificarArquivo(nome: string): 'pdf' | 'imagem' | 'planilha' | 'texto' | null {
  const ext = extensao(nome);
  if (ext === 'pdf') return 'pdf';
  if (IMAGENS[ext]) return 'imagem';
  if (ext === 'xlsx') return 'planilha';
  if (TEXTOS.includes(ext)) return 'texto';
  return null;
}

export function paraBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < u8.length; i += passo) bin += String.fromCharCode(...u8.subarray(i, i + passo));
  return btoa(bin);
}

function celulaTexto(c: unknown): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10).split('-').reverse().join('/');
  if (typeof c === 'number') return String(c).replace('.', ',');
  return String(c).replace(/[\r\n;]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Converte as linhas de uma aba em texto separado por ";" (ignora linhas e colunas finais vazias) */
export function linhasParaTexto(linhas: unknown[][]): string {
  const saida: string[] = [];
  for (const linha of linhas) {
    const celulas = linha.map(celulaTexto);
    while (celulas.length && celulas[celulas.length - 1] === '') celulas.pop();
    if (celulas.length === 0) continue;
    saida.push(celulas.join(';'));
  }
  return saida.join('\n');
}

/** Lê o texto decodificando UTF-8, ou Latin-1 se não for UTF-8 válido (comum em CSV/OFX de bancos) */
export function decodificarTexto(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export async function prepararArquivo(nome: string, conteudo: Blob): Promise<ArquivoPreparado> {
  const tipo = classificarArquivo(nome);
  if (!tipo) {
    if (extensao(nome) === 'xls') throw new Error(`"${nome}": salve a planilha como .xlsx (Excel novo) ou PDF.`);
    throw new Error(`"${nome}": formato não aceito. Use PDF, imagem, Excel (.xlsx), CSV, TXT, OFX ou XML.`);
  }
  if (conteudo.size === 0) throw new Error(`"${nome}" está vazio.`);
  const bytes = await conteudo.arrayBuffer();
  if (tipo === 'pdf') return { nome, tipo: 'pdf', dados: paraBase64(bytes), tamanho: conteudo.size };
  if (tipo === 'imagem') return { nome, tipo: 'imagem', media_type: IMAGENS[extensao(nome)], dados: paraBase64(bytes), tamanho: conteudo.size };

  let texto: string;
  if (tipo === 'planilha') {
    const abas = await readSheetNames(bytes);
    const partes: string[] = [];
    for (const aba of abas) {
      const linhas = await readXlsxFile(bytes, { sheet: aba });
      const t = linhasParaTexto(linhas as unknown[][]);
      if (t) partes.push(`### Aba: ${aba}\n${t}`);
    }
    texto = partes.join('\n\n');
  } else {
    texto = decodificarTexto(bytes);
  }
  if (!texto.trim()) throw new Error(`"${nome}" não tem conteúdo legível.`);
  if (texto.length > LIMITE_TEXTO_IA) throw new Error(`"${nome}" é grande demais para conferir de uma vez. Divida o arquivo ou envie só o período necessário.`);
  return { nome, tipo: 'texto', dados: texto, tamanho: conteudo.size };
}

export async function prepararAnexo(a: Anexo): Promise<ArquivoPreparado> {
  const { data, error } = await supabase().storage.from('anexos').download(a.caminho);
  if (error || !data) throw error ?? new Error(`"${a.nome_arquivo}" não foi encontrado.`);
  return prepararArquivo(a.nome_arquivo, data);
}

export function conferirLimites(arquivos: ArquivoPreparado[]): string | null {
  if (arquivos.length === 0) return 'Escolha pelo menos um arquivo.';
  if (arquivos.length > MAX_ARQUIVOS_IA) return `Envie no máximo ${MAX_ARQUIVOS_IA} arquivos por conferência.`;
  const total = arquivos.reduce((s, a) => s + a.dados.length, 0);
  if (total > LIMITE_TOTAL_IA) return 'Os arquivos somam mais de 20 MB. Envie menos arquivos por vez.';
  return null;
}

export type PedidoConferencia = {
  tipo: TipoConferencia;
  instrucoes?: string;
  empresa_id?: string | null;
  tarefa_id?: string | null;
  arquivos: ArquivoPreparado[];
};

/** Pede a conferência à função segura. Pode levar alguns minutos. */
export async function conferirComIA(pedido: PedidoConferencia): Promise<{ conferencia: Conferencia; aviso?: string }> {
  const limite = conferirLimites(pedido.arquivos);
  if (limite) throw new Error(limite);
  const { data, error } = await supabase().functions.invoke('conferencia-ia', { body: pedido });
  if (error) {
    let mensagem = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') mensagem = (await ctx.json()).erro ?? mensagem;
    } catch { /* ignora */ }
    if (/failed to send|not found|404/i.test(mensagem)) {
      mensagem = 'A função "conferencia-ia" não está instalada no Supabase. Veja o passo de preparação no LEIA-ME.';
    }
    throw new Error(mensagem);
  }
  const corpo = typeof data === 'string' ? JSON.parse(data) : data;
  if (corpo?.erro) throw new Error(corpo.erro);
  if (!corpo?.conferencia) throw new Error('A conferência não retornou resultado. Tente de novo.');
  return corpo;
}
