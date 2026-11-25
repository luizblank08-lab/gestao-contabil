// Formatos brasileiros: datas, dinheiro, telefone.
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

dayjs.locale('pt-br');

export function formatarData(data: string | Date | null | undefined): string {
  if (!data) return '—';
  const d = dayjs(data);
  return d.isValid() ? d.format('DD/MM/YYYY') : '—';
}

export function formatarDataHora(data: string | Date | null | undefined): string {
  if (!data) return '—';
  const d = dayjs(data);
  return d.isValid() ? d.format('DD/MM/YYYY [às] HH:mm') : '—';
}

/** Competência no formato MM/AAAA (ex.: 11/2026) */
export function formatarCompetencia(data: string | Date): string {
  return dayjs(data).format('MM/YYYY');
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatarReais(valor: number | null | undefined): string {
  return valor == null ? '—' : moeda.format(valor);
}

export function formatarPercentual(valor: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor)}%`;
}

export function mascaraTelefone(valor: string): string {
  const d = (valor || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

/** Remove acentos e deixa minúsculo, para buscas */
export function normalizar(texto: string): string {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
