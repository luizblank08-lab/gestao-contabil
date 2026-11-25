import { describe, expect, it } from 'vitest';
import { aplicaPelaRegra, anualParaMesAno, descreverAplicacao, descreverVencimento, mesAnoParaAnual, obrigacoesDaEmpresa } from '../modelos';
import type { Modelo } from '../tipos';

const base: Modelo = {
  id: 'm1', escritorio_id: 'e', codigo_padrao: null, nome: 'X', descricao: null, area: 'fiscal', periodicidade: 'mensal',
  tipo_vencimento: 'dia_fixo', dia: 20, meses_apos: 1, ajuste: 'posterga', regimes: [], atividades: [],
  somente_com_funcionarios: false, ativo: true, ordem: 0,
};

describe('descrição do vencimento', () => {
  it('dia fixo', () => expect(descreverVencimento(base)).toBe('Dia 20 do mês seguinte (adia se não for dia útil)'));
  it('dia útil', () => expect(descreverVencimento({ ...base, tipo_vencimento: 'dia_util', dia: 10, meses_apos: 2 })).toBe('10º dia útil do 2º mês seguinte'));
  it('trimestral', () => expect(descreverVencimento({ ...base, periodicidade: 'trimestral', tipo_vencimento: 'ultimo_dia_util', dia: null })).toBe('Último dia útil do mês seguinte ao fim do trimestre'));
  it('anual no ano seguinte', () => expect(descreverVencimento({ ...base, periodicidade: 'anual', tipo_vencimento: 'ultimo_dia_util', dia: null, meses_apos: 6 })).toBe('Último dia útil de junho do ano seguinte'));
  it('anual no próprio ano', () => expect(descreverVencimento({ ...base, periodicidade: 'anual', dia: 30, meses_apos: -1, ajuste: 'antecipa' })).toBe('Dia 30 de novembro do próprio ano (antecipa se não for dia útil)'));
  it('dia 31 = último dia', () => expect(descreverVencimento({ ...base, dia: 31, ajuste: 'nenhum' })).toBe('Último dia do mês seguinte'));
});

describe('mês do vencimento anual', () => {
  it('ida e volta', () => {
    for (const m of [-11, -1, 0, 3, 6, 12, 18]) {
      const { mes, ano } = anualParaMesAno(m);
      expect(mesAnoParaAnual(mes, ano)).toBe(m);
    }
    expect(anualParaMesAno(6)).toEqual({ mes: 6, ano: 1 });
    expect(anualParaMesAno(0)).toEqual({ mes: 12, ano: 0 });
    expect(anualParaMesAno(-1)).toEqual({ mes: 11, ano: 0 });
  });
});

describe('aplicação às empresas', () => {
  const simplesComercio = { regime: 'simples' as const, atividades: ['comercio' as const], possui_funcionarios: false };
  it('regime e atividade', () => {
    expect(aplicaPelaRegra({ ...base, regimes: ['simples'] }, simplesComercio)).toBe(true);
    expect(aplicaPelaRegra({ ...base, regimes: ['presumido'] }, simplesComercio)).toBe(false);
    expect(aplicaPelaRegra({ ...base, atividades: ['servico'] }, simplesComercio)).toBe(false);
    expect(aplicaPelaRegra({ ...base, atividades: ['servico', 'comercio'] }, simplesComercio)).toBe(true);
  });
  it('empresa sem regime só recebe itens sem restrição de regime', () => {
    expect(aplicaPelaRegra({ ...base, regimes: ['simples'] }, { ...simplesComercio, regime: null })).toBe(false);
    expect(aplicaPelaRegra(base, { ...simplesComercio, regime: null })).toBe(true);
  });
  it('funcionários', () => {
    expect(aplicaPelaRegra({ ...base, somente_com_funcionarios: true }, simplesComercio)).toBe(false);
    expect(aplicaPelaRegra({ ...base, somente_com_funcionarios: true }, { ...simplesComercio, possui_funcionarios: true })).toBe(true);
  });
  it('exceções e itens desativados', () => {
    const lista = obrigacoesDaEmpresa(
      [{ ...base, id: 'a' }, { ...base, id: 'b', regimes: ['real'] }, { ...base, id: 'c', ativo: false }],
      simplesComercio,
      [{ empresa_id: 'x', modelo_id: 'a', incluir: false }, { empresa_id: 'x', modelo_id: 'b', incluir: true }, { empresa_id: 'x', modelo_id: 'c', incluir: true }],
    );
    expect(lista.map((o) => o.aplicada)).toEqual([false, true, false]);
  });
  it('texto da aplicação', () => {
    expect(descreverAplicacao({ regimes: ['simples'], atividades: ['comercio', 'industria'], somente_com_funcionarios: true })).toBe('Simples Nacional · Comércio, Indústria · só com funcionários');
    expect(descreverAplicacao({ regimes: [], atividades: [], somente_com_funcionarios: false })).toBe('Todos os regimes · todas as atividades');
  });
});
