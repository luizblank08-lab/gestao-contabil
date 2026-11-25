import { describe, expect, it } from 'vitest';
import { converterRegime, lerLinhas, nomeBonito, sugerirMembro } from '../planilha';

const planilha = [
  ['Código', 'Empresa', 'Classificação tributária', 'Responsável Escrita', 'Responsável Contábil'],
  ['410', 'AGRO TESTE LTDA', 'Presumido', 'LUIZ', 'KAUANE'],
  [212, 'MERCADO EXEMPLO', 'Simples', 'FERNANDA', '##########'],
  ['99', 'SEM REGIME SA', null, null, 'Fabiana'],
  ['77', 'GRANDE SA', 'Lucro Real', 'luiz', 'kauane'],
  [null, null, null, null, null],
];

describe('leitura da planilha', () => {
  const r = lerLinhas(planilha);
  it('reconhece as colunas pelo título', () => {
    expect(r.erros).toEqual([]);
    expect(r.colunas).toMatchObject({ codigo: 'Código', empresa: 'Empresa', regime: 'Classificação tributária', fiscal: 'Responsável Escrita', contabil: 'Responsável Contábil' });
  });
  it('lê as empresas e ignora linhas vazias', () => {
    expect(r.linhas.map((l) => l.codigo)).toEqual(['410', '212', '99', '77']);
    expect(r.linhas.map((l) => l.regime)).toEqual(['presumido', 'simples', null, 'real']);
  });
  it('sinaliza problemas', () => {
    expect(r.linhas[1].avisos).toContain('responsável Contábil ilegível ("##########")');
    expect(r.linhas[2].avisos).toEqual(['regime em branco', 'sem responsável Fiscal/Escrita']);
  });
  it('junta a mesma pessoa escrita de jeitos diferentes', () => {
    expect(r.pessoas.get('luiz')).toMatchObject({ nome: 'Luiz', empresas: 2 });
    expect([...r.pessoas.get('luiz')!.areas]).toEqual(['fiscal']);
    expect(r.pessoas.get('kauane')!.empresas).toBe(2);
    expect(r.pessoas.size).toBe(4);
  });
  it('acusa planilha sem código', () => {
    expect(lerLinhas([['Empresa'], ['X']]).erros[0]).toMatch(/Código/);
  });
});

describe('auxiliares', () => {
  it('regimes', () => {
    expect(converterRegime('Simples Nacional')).toBe('simples');
    expect(converterRegime('LUCRO PRESUMIDO')).toBe('presumido');
    expect(converterRegime('MEI')).toBe('mei');
    expect(converterRegime('xyz')).toBeNull();
  });
  it('nomes', () => expect(nomeBonito('ANA PAULA DA SILVA')).toBe('Ana Paula da Silva'));
  it('sugere membro pelo primeiro nome', () => {
    const m = [{ id: '1', nome: 'Luiz Blank', ativo: true }, { id: '2', nome: 'Fernanda Souza', ativo: true }, { id: '3', nome: 'Fernanda Lima', ativo: true }];
    expect(sugerirMembro('luiz', m)).toBe('1');
    expect(sugerirMembro('fernanda', m)).toBeNull(); // ambíguo: não chuta
    expect(sugerirMembro('fernanda lima', m)).toBe('3');
  });
});
