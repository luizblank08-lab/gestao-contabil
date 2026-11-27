import { describe, expect, it } from 'vitest';
import { competenciaPadrao, listaCompetencias, nomeSeguroArquivo, ordenarTarefas, resumir, resumirPor, rotuloPeriodo, situacao, tamanhoLegivel, textoPrazo } from '../tarefas';

const H = '2026-11-26';
describe('situação', () => {
  it('calcula atrasada, vence logo e pendente', () => {
    expect(situacao({ status: 'pendente', vencimento: '2026-11-25' }, H)).toBe('atrasado');
    expect(situacao({ status: 'pendente', vencimento: '2026-11-26' }, H)).toBe('vence_logo');
    expect(situacao({ status: 'pendente', vencimento: '2026-12-03' }, H)).toBe('vence_logo');
    expect(situacao({ status: 'pendente', vencimento: '2026-12-04' }, H)).toBe('pendente');
    expect(situacao({ status: 'feito', vencimento: '2026-01-01' }, H)).toBe('feito');
    expect(situacao({ status: 'nao_se_aplica', vencimento: '2026-01-01' }, H)).toBe('nao_se_aplica');
    expect(situacao({ status: 'pendente', vencimento: '2026-11-01', devolvida_em: '2026-11-20T10:00:00Z' }, H)).toBe('devolvida');
    expect(situacao({ status: 'feito', vencimento: '2026-11-01', devolvida_em: null }, H)).toBe('feito');
  });
  it('texto do prazo', () => {
    expect(textoPrazo({ status: 'pendente', vencimento: '2026-11-24' }, H)).toBe('venceu há 2 dias');
    expect(textoPrazo({ status: 'pendente', vencimento: '2026-11-25' }, H)).toBe('venceu ontem');
    expect(textoPrazo({ status: 'pendente', vencimento: H }, H)).toBe('vence hoje');
    expect(textoPrazo({ status: 'pendente', vencimento: '2026-11-27' }, H)).toBe('vence amanhã');
    expect(textoPrazo({ status: 'feito', vencimento: '2026-11-27' }, H)).toBe('');
  });
});

describe('competência e período', () => {
  it('padrão é o mês anterior, respeitando o início de uso', () => {
    expect(competenciaPadrao('2026-01-01', H)).toBe('2026-10-01');
    expect(competenciaPadrao('2026-11-01', H)).toBe('2026-11-01');
    expect(competenciaPadrao(null, '2027-01-15')).toBe('2026-12-01');
  });
  it('rótulos de período', () => {
    expect(rotuloPeriodo({ periodicidade: 'mensal', periodo_ref: '2026-11-01' })).toBe('11/2026');
    expect(rotuloPeriodo({ periodicidade: 'trimestral', periodo_ref: '2026-10-01' })).toBe('4º trim./2026');
    expect(rotuloPeriodo({ periodicidade: 'anual', periodo_ref: '2026-01-01' })).toBe('Ano-base 2026');
  });
  it('lista de competências', () => {
    const l = listaCompetencias(H, 2, 1);
    expect(l.map((x) => x.label)).toEqual(['12/2026', '11/2026', '10/2026', '09/2026']);
  });
});

describe('indicadores', () => {
  const lista = [
    { status: 'feito' as const, vencimento: '2026-11-20', nome: 'a', emp: 'X' },
    { status: 'nao_se_aplica' as const, vencimento: '2026-11-20', nome: 'b', emp: 'X' },
    { status: 'pendente' as const, vencimento: '2026-11-20', nome: 'c', emp: 'Y' },
    { status: 'pendente' as const, vencimento: '2026-11-30', nome: 'd', emp: 'Y' },
    { status: 'pendente' as const, vencimento: '2026-12-20', nome: 'e', emp: 'Y' },
  ];
  it('resumo e percentual', () => {
    expect(resumir(lista, H)).toEqual({ total: 5, feito: 1, naoSeAplica: 1, devolvida: 0, atrasado: 1, venceLogo: 1, pendente: 1, percentual: 40 });
    expect(resumir([], H).percentual).toBe(0);
  });
  it('resumo por grupo', () => {
    const r = resumirPor(lista, (t) => t.emp, H);
    expect(r.find((x) => x.chave === 'X')!.percentual).toBe(100);
    expect(r.find((x) => x.chave === 'Y')!.atrasado).toBe(1);
  });
  it('ordena atrasadas primeiro', () => {
    expect(ordenarTarefas(lista, H).map((t) => t.nome)).toEqual(['c', 'd', 'e', 'a', 'b']);
  });
});

describe('arquivos', () => {
  it('nome seguro', () => expect(nomeSeguroArquivo('Guia DAS – Novembro (2026).pdf')).toBe('Guia_DAS_Novembro_2026_.pdf'));
  it('tamanho', () => {
    expect(tamanhoLegivel(2048)).toBe('2 KB');
    expect(tamanhoLegivel(1572864)).toBe('1,5 MB');
  });
});
