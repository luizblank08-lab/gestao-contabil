// Regras dos modelos de checklist: descrição do vencimento em português e aplicação às empresas.
import type { Atividade, Regime } from './constantes';
import { rotuloAtividade, rotuloRegime } from './constantes';
import type { Ajuste, Excecao, Modelo, Periodicidade, TipoVencimento } from './tipos';

export const PERIODICIDADES: { value: Periodicidade; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];
export const rotuloPeriodicidade = (p: string) => PERIODICIDADES.find((x) => x.value === p)?.label ?? p;

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Anual: meses_apos <-> (mês 1–12, ano 0 = mesmo ano / 1 = ano seguinte / 2 …) */
export function anualParaMesAno(mesesApos: number): { mes: number; ano: number } {
  const total = 12 + mesesApos; // mês contado a partir de janeiro do ano-base (1 = jan)
  return { mes: ((total - 1) % 12) + 1, ano: Math.floor((total - 1) / 12) };
}
export function mesAnoParaAnual(mes: number, ano: number): number {
  return mes + 12 * ano - 12;
}

function ordinal(n: number) {
  return `${n}º`;
}

function textoMes(periodicidade: Periodicidade, mesesApos: number): string {
  if (periodicidade === 'anual') {
    const { mes, ano } = anualParaMesAno(mesesApos);
    const quando = ano === 0 ? 'do próprio ano' : ano === 1 ? 'do ano seguinte' : `de ${ano} anos depois`;
    return `de ${MESES[mes - 1]} ${quando}`;
  }
  const base = periodicidade === 'trimestral' ? ' ao fim do trimestre' : '';
  if (mesesApos === 0) return periodicidade === 'trimestral' ? 'do último mês do trimestre' : 'do próprio mês';
  if (mesesApos === 1) return `do mês seguinte${base}`;
  if (mesesApos > 1) return `do ${ordinal(mesesApos)} mês seguinte${base}`;
  return `de ${-mesesApos} mês(es) antes`;
}

const textoAjuste: Record<Ajuste, string> = {
  antecipa: ' (antecipa se não for dia útil)',
  posterga: ' (adia se não for dia útil)',
  nenhum: '',
};

/** Ex.: "Dia 20 do mês seguinte (adia se não for dia útil)" */
export function descreverVencimento(m: {
  periodicidade: Periodicidade; tipo_vencimento: TipoVencimento; dia: number | null; meses_apos: number; ajuste: Ajuste;
}): string {
  const mes = textoMes(m.periodicidade, m.meses_apos);
  if (m.tipo_vencimento === 'ultimo_dia_util') return `Último dia útil ${mes}`;
  if (m.tipo_vencimento === 'dia_util') return `${ordinal(m.dia ?? 1)} dia útil ${mes}`;
  const dia = m.dia === 31 ? 'Último dia' : `Dia ${m.dia}`;
  return `${dia} ${mes}${textoAjuste[m.ajuste]}`;
}

/** Ex.: "Simples Nacional · Comércio, Indústria · só com funcionários" */
export function descreverAplicacao(m: Pick<Modelo, 'regimes' | 'atividades' | 'somente_com_funcionarios'>): string {
  const partes = [
    m.regimes.length ? m.regimes.map(rotuloRegime).join(', ') : 'Todos os regimes',
    m.atividades.length ? m.atividades.map(rotuloAtividade).join(', ') : 'todas as atividades',
  ];
  if (m.somente_com_funcionarios) partes.push('só com funcionários');
  return partes.join(' · ');
}

export type DadosEmpresaRegra = { regime: Regime | null; atividades: Atividade[]; possui_funcionarios: boolean };

/** O item se aplica pela regra? (mesma regra do banco: modelo_aplica_empresa) */
export function aplicaPelaRegra(m: Pick<Modelo, 'regimes' | 'atividades' | 'somente_com_funcionarios'>, e: DadosEmpresaRegra): boolean {
  if (m.regimes.length > 0 && (!e.regime || !m.regimes.includes(e.regime))) return false;
  if (m.atividades.length > 0 && !m.atividades.some((a) => e.atividades.includes(a))) return false;
  if (m.somente_com_funcionarios && !e.possui_funcionarios) return false;
  return true;
}

export type ObrigacaoCalculada = { modelo: Modelo; pelaRegra: boolean; excecao: boolean | null; aplicada: boolean };

/** Lista de itens com a situação para a empresa (regra + exceções). Itens desativados nunca se aplicam. */
export function obrigacoesDaEmpresa(modelos: Modelo[], e: DadosEmpresaRegra, excecoes: Excecao[]): ObrigacaoCalculada[] {
  const mapa = new Map(excecoes.map((x) => [x.modelo_id, x.incluir]));
  return modelos.map((m) => {
    const pelaRegra = aplicaPelaRegra(m, e);
    const excecao = mapa.has(m.id) ? mapa.get(m.id)! : null;
    return { modelo: m, pelaRegra, excecao, aplicada: m.ativo && (excecao ?? pelaRegra) };
  });
}
