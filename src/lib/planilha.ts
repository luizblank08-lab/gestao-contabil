// Leitura da planilha de empresas e responsáveis (formato livre, colunas reconhecidas pelo título).
import type { Area, Regime } from './constantes';
import { limparCnpj, validarCnpj } from './cnpj';
import { normalizar } from './formatos';

export type LinhaImportada = {
  linha: number; // número da linha na planilha (para mensagens)
  codigo: string;
  razao_social: string;
  cnpj: string | null;
  regime: Regime | null;
  regimeOriginal: string;
  responsaveis: Partial<Record<Area, string | null>>; // nome como está na planilha
  avisos: string[];
};

export type ResultadoLeitura = {
  linhas: LinhaImportada[];
  colunas: Partial<Record<'codigo' | 'empresa' | 'cnpj' | 'regime' | Area, string>>;
  erros: string[];
  /** Nome normalizado -> { nome bonito, áreas em que aparece, quantas empresas } */
  pessoas: Map<string, { nome: string; areas: Set<Area>; empresas: number }>;
};

type Celula = string | number | boolean | Date | null | undefined;

const PADROES: { chave: keyof ResultadoLeitura['colunas']; testes: RegExp[] }[] = [
  { chave: 'codigo', testes: [/^cod/, /^id$/] },
  { chave: 'cnpj', testes: [/cnpj/] },
  { chave: 'empresa', testes: [/razao/, /^empresa/, /^cliente/, /^nome/] },
  { chave: 'regime', testes: [/regime/, /classifica/, /tribut/, /enquadra/] },
  { chave: 'fiscal', testes: [/escrita/, /fiscal/] },
  { chave: 'contabil', testes: [/contab/] },
  { chave: 'dp', testes: [/pessoal/, /^dp\b/, /resp.*dp\b/, /folha/] },
];

export function converterRegime(texto: string): Regime | null {
  const t = normalizar(texto).trim();
  if (!t) return null;
  if (t.includes('mei') || t.includes('microempreendedor')) return 'mei';
  if (t.includes('simples')) return 'simples';
  if (t.includes('presumido')) return 'presumido';
  if (t.includes('real')) return 'real';
  return null;
}

/** "FERNANDA" -> "Fernanda"; "ana paula" -> "Ana Paula" */
export function nomeBonito(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (['da', 'de', 'do', 'das', 'dos', 'e'].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const textoCelula = (c: Celula) => (c == null ? '' : String(c).trim());

/** Nome de responsável válido? "##########" acontece quando a coluna do Excel está estreita demais. */
function nomeValido(n: string) {
  return n.length > 0 && !/^#+$/.test(n) && !/^[-–—.]+$/.test(n);
}

export function lerLinhas(linhas: Celula[][]): ResultadoLeitura {
  const erros: string[] = [];
  const colunas: ResultadoLeitura['colunas'] = {};
  const indice: Partial<Record<keyof ResultadoLeitura['colunas'], number>> = {};

  // Procura a linha de títulos entre as 10 primeiras
  let linhaTitulo = -1;
  for (let i = 0; i < Math.min(linhas.length, 10) && linhaTitulo < 0; i++) {
    const titulos = linhas[i].map((c) => normalizar(textoCelula(c)));
    if (titulos.some((t) => /razao|empresa|cliente/.test(t))) linhaTitulo = i;
  }
  if (linhaTitulo < 0) {
    return { linhas: [], colunas, erros: ['Não encontrei a linha de títulos (precisa ter uma coluna "Empresa" ou "Razão social").'], pessoas: new Map() };
  }

  linhas[linhaTitulo].forEach((c, i) => {
    const t = normalizar(textoCelula(c));
    if (!t) return;
    for (const p of PADROES) {
      if (indice[p.chave] === undefined && p.testes.some((r) => r.test(t))) {
        indice[p.chave] = i;
        colunas[p.chave] = textoCelula(c);
        break;
      }
    }
  });

  if (indice.empresa === undefined) erros.push('Não encontrei a coluna com o nome da empresa.');
  if (indice.codigo === undefined) erros.push('Não encontrei a coluna "Código". Ela é usada para não duplicar empresas ao importar de novo.');

  const resultado: LinhaImportada[] = [];
  const pessoas: ResultadoLeitura['pessoas'] = new Map();
  const codigosVistos = new Map<string, number>();
  const areas: Area[] = ['fiscal', 'contabil', 'dp'];

  if (erros.length === 0) {
    for (let i = linhaTitulo + 1; i < linhas.length; i++) {
      const l = linhas[i];
      const get = (k: keyof ResultadoLeitura['colunas']) => (indice[k] === undefined ? '' : textoCelula(l[indice[k]!]));
      const razao = get('empresa');
      let codigo = get('codigo');
      if (!razao && !codigo) continue; // linha vazia
      codigo = codigo.replace(/\.0+$/, '');
      const avisos: string[] = [];
      if (!razao) avisos.push('sem nome da empresa');
      if (!codigo) avisos.push('sem código');
      if (codigo && codigosVistos.has(codigo)) avisos.push(`código repetido (também na linha ${codigosVistos.get(codigo)})`);
      if (codigo) codigosVistos.set(codigo, i + 1);

      const regimeOriginal = get('regime');
      const regime = converterRegime(regimeOriginal);
      if (indice.regime !== undefined) {
        if (!regimeOriginal) avisos.push('regime em branco');
        else if (!regime) avisos.push(`regime "${regimeOriginal}" não reconhecido`);
      }

      const cnpjTxt = get('cnpj');
      let cnpj: string | null = null;
      if (cnpjTxt) {
        const limpo = limparCnpj(cnpjTxt.padStart(14, '0'));
        if (validarCnpj(limpo)) cnpj = limpo;
        else avisos.push(`CNPJ "${cnpjTxt}" inválido (ignorado)`);
      }

      const responsaveis: LinhaImportada['responsaveis'] = {};
      for (const a of areas) {
        if (indice[a] === undefined) continue;
        const bruto = get(a);
        if (!nomeValido(bruto)) {
          responsaveis[a] = null;
          const rotulo = a === 'fiscal' ? 'Fiscal/Escrita' : a === 'contabil' ? 'Contábil' : 'DP';
          avisos.push(bruto ? `responsável ${rotulo} ilegível ("${bruto}")` : `sem responsável ${rotulo}`);
          continue;
        }
        const chave = normalizar(bruto).replace(/\s+/g, ' ');
        responsaveis[a] = chave;
        const p = pessoas.get(chave) ?? { nome: nomeBonito(bruto), areas: new Set<Area>(), empresas: 0 };
        p.areas.add(a);
        p.empresas++;
        pessoas.set(chave, p);
      }

      resultado.push({ linha: i + 1, codigo, razao_social: razao, cnpj, regime, regimeOriginal, responsaveis, avisos });
    }
    if (resultado.length === 0) erros.push('A planilha não tem nenhuma empresa abaixo dos títulos.');
  }

  return { linhas: resultado, colunas, erros, pessoas };
}

/** Sugere o usuário da equipe para um nome da planilha (pelo nome completo ou primeiro nome, sem acento). */
export function sugerirMembro<T extends { id: string; nome: string; ativo: boolean }>(chave: string, membros: T[]): string | null {
  const ativos = membros.filter((m) => m.ativo);
  const completo = ativos.filter((m) => normalizar(m.nome).replace(/\s+/g, ' ') === chave);
  if (completo.length === 1) return completo[0].id;
  const primeiro = ativos.filter((m) => normalizar(m.nome).split(/\s+/)[0] === chave.split(' ')[0]);
  return primeiro.length === 1 ? primeiro[0].id : null;
}
