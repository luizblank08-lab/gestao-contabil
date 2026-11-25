import { describe, expect, it } from 'vitest';
import { mascaraCnpj, validarCnpj, limparCnpj } from '../cnpj';
import { formatarData, formatarReais, mascaraTelefone } from '../formatos';

describe('CNPJ', () => {
  it('valida CNPJs numéricos corretos', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11444777000161')).toBe(true);
  });
  it('recusa CNPJs inválidos', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false);
    expect(validarCnpj('00.000.000/0000-00')).toBe(false);
    expect(validarCnpj('123')).toBe(false);
  });
  it('valida o novo CNPJ alfanumérico (exemplo oficial da Receita)', () => {
    expect(validarCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(validarCnpj('12.ABC.345/01DE-36')).toBe(false);
  });
  it('aplica máscara', () => {
    expect(mascaraCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascaraCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(limparCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
  });
});

describe('formatos brasileiros', () => {
  it('data dd/mm/aaaa', () => expect(formatarData('2026-11-05')).toBe('05/11/2026'));
  it('reais', () => expect(formatarReais(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50'));
  it('telefone', () => {
    expect(mascaraTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascaraTelefone('1133334444')).toBe('(11) 3333-4444');
  });
});
