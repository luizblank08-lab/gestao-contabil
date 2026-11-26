// Situação das tarefas, competências e indicadores.
import dayjs from 'dayjs';
import type { Tarefa } from './tipos';

/** Situação exibida (o banco guarda pendente/feito/não se aplica; "atrasada" e "vence logo" são calculadas). */
export type Situacao = 'feito' | 'nao_se_aplica' | 'atrasado' | 'vence_logo' | 'pendente';

export const SITUACOES: Record<Situacao, { rotulo: string; cor: string; ordem: number }> = {
  atrasado: { rotulo: 'Atrasada', cor: '#dc3c3d', ordem: 0 },
  vence_logo: { rotulo: 'Vence em até 7 dias', cor: '#f18a59', ordem: 1 },
  pendente: { rotulo: 'Pendente', cor: '#fbb315', ordem: 2 },
  feito: { rotulo: 'Feita', cor: '#0aac23', ordem: 3 },
  nao_se_aplica: { rotulo: 'Não se aplica', cor: '#9aa0a6', ordem: 4 },
};

export const hojeISO = () => dayjs().format('YYYY-MM-DD');

export function situacao(t: Pick<Tarefa, 'status' | 'vencimento'>, hoje = hojeISO()): Situacao {
  if (t.status === 'feito') return 'feito';
  if (t.status === 'nao_se_aplica') return 'nao_se_aplica';
  if (t.vencimento < hoje) return 'atrasado';
  if (dayjs(t.vencimento).diff(dayjs(hoje), 'day') <= 7) return 'vence_logo';
  return 'pendente';
}

/** Dias até o vencimento (negativo = atrasado) */
export const diasAte = (vencimento: string, hoje = hojeISO()) => dayjs(vencimento).diff(dayjs(hoje), 'day');

export function textoPrazo(t: Pick<Tarefa, 'status' | 'vencimento'>, hoje = hojeISO()): string {
  if (t.status !== 'pendente') return '';
  const d = diasAte(t.vencimento, hoje);
  if (d < 0) return d === -1 ? 'venceu ontem' : `venceu há ${-d} dias`;
  if (d === 0) return 'vence hoje';
  if (d === 1) return 'vence amanhã';
  return `vence em ${d} dias`;
}

/** "11/2026", "4º trim./2026" ou "Ano-base 2026" */
export function rotuloPeriodo(t: Pick<Tarefa, 'periodicidade' | 'periodo_ref'>): string {
  const d = dayjs(t.periodo_ref);
  if (t.periodicidade === 'trimestral') return `${Math.floor(d.month() / 3) + 1}º trim./${d.year()}`;
  if (t.periodicidade === 'anual') return `Ano-base ${d.year()}`;
  return d.format('MM/YYYY');
}

/** Competência padrão: o mês anterior (o trabalho de dezembro é a competência de novembro),
 *  mas nunca antes do início de uso do escritório. */
export function competenciaPadrao(inicio: string | null | undefined, hoje = hojeISO()): string {
  const anterior = dayjs(hoje).startOf('month').subtract(1, 'month').format('YYYY-MM-DD');
  if (inicio && anterior < inicio) return dayjs(inicio).startOf('month').format('YYYY-MM-DD');
  return anterior;
}

/** Lista de competências para escolher (do mais recente para o mais antigo) */
export function listaCompetencias(hoje = hojeISO(), mesesAtras = 24, mesesFrente = 2) {
  const base = dayjs(hoje).startOf('month');
  const out: { value: string; label: string }[] = [];
  for (let i = mesesFrente; i >= -mesesAtras; i--) {
    const d = base.add(i, 'month');
    out.push({ value: d.format('YYYY-MM-DD'), label: d.format('MM/YYYY') });
  }
  return out;
}

export type Resumo = { total: number; feito: number; naoSeAplica: number; atrasado: number; venceLogo: number; pendente: number; percentual: number };

/** Conta as situações; percentual de conclusão = (feitas + não se aplica) / total */
export function resumir(tarefas: Pick<Tarefa, 'status' | 'vencimento'>[], hoje = hojeISO()): Resumo {
  const r: Resumo = { total: tarefas.length, feito: 0, naoSeAplica: 0, atrasado: 0, venceLogo: 0, pendente: 0, percentual: 0 };
  for (const t of tarefas) {
    const s = situacao(t, hoje);
    if (s === 'feito') r.feito++;
    else if (s === 'nao_se_aplica') r.naoSeAplica++;
    else if (s === 'atrasado') r.atrasado++;
    else if (s === 'vence_logo') r.venceLogo++;
    else r.pendente++;
  }
  r.percentual = r.total ? Math.round(((r.feito + r.naoSeAplica) / r.total) * 100) : 0;
  return r;
}

/** Agrupa e resume por uma chave (empresa, responsável, área…) */
export function resumirPor<T extends Pick<Tarefa, 'status' | 'vencimento'>>(tarefas: T[], chave: (t: T) => string, hoje = hojeISO()) {
  const grupos = new Map<string, T[]>();
  for (const t of tarefas) {
    const k = chave(t);
    grupos.set(k, [...(grupos.get(k) ?? []), t]);
  }
  return [...grupos.entries()].map(([k, lista]) => ({ chave: k, ...resumir(lista, hoje) }));
}

/** Ordenação padrão: atrasadas primeiro, depois por vencimento */
export function ordenarTarefas<T extends Pick<Tarefa, 'status' | 'vencimento' | 'nome'>>(lista: T[], hoje = hojeISO()): T[] {
  return [...lista].sort((a, b) =>
    SITUACOES[situacao(a, hoje)].ordem - SITUACOES[situacao(b, hoje)].ordem || a.vencimento.localeCompare(b.vencimento) || a.nome.localeCompare(b.nome));
}

/** Nome seguro para o arquivo no armazenamento (sem acentos nem caracteres especiais) */
export function nomeSeguroArquivo(nome: string): string {
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
  return limpo.slice(-100) || 'arquivo';
}

export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
